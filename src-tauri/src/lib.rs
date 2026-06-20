use std::{
    fs,
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, Manager, State,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::ShortcutState;
use write_core::{Analysis, ApplyOutcome, Suggestion};
use write_service::{AnalyzeInput, ApplySafeInput, RulesResponse, WritingMode};

const DEFAULT_HOTKEY: &str = "Ctrl+Alt+A";
const MAX_CAPTURE_CHARS: usize = 20_000;
const CAPTURE_POLL_ATTEMPTS: usize = 12;
const CAPTURE_POLL_INTERVAL: Duration = Duration::from_millis(45);
const FOCUS_RETURN_DELAY: Duration = Duration::from_millis(180);
const HOTKEY_RELEASE_TIMEOUT: Duration = Duration::from_millis(700);
const HOTKEY_RELEASE_POLL_INTERVAL: Duration = Duration::from_millis(20);

#[derive(Debug, Clone, Serialize)]
pub struct CommandError {
    message: String,
}

impl CommandError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl std::fmt::Display for CommandError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for CommandError {}

impl From<write_core::PatchError> for CommandError {
    fn from(error: write_core::PatchError) -> Self {
        Self::new(error.to_string())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompanionSettings {
    pub ui_language: String,
    pub writing_mode: WritingMode,
    pub hotkey: String,
    pub restore_clipboard: bool,
    pub first_run_privacy_seen: bool,
}

impl Default for CompanionSettings {
    fn default() -> Self {
        Self {
            ui_language: "ar".to_owned(),
            writing_mode: WritingMode::Auto,
            hotkey: DEFAULT_HOTKEY.to_owned(),
            restore_clipboard: true,
            first_run_privacy_seen: false,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct CompanionStatus {
    pub engine_online: bool,
    pub hotkey: String,
    pub mode: &'static str,
}

#[derive(Debug, Clone, Serialize)]
pub struct CaptureResult {
    pub captured_text: String,
    pub current_text: String,
    pub source_app: Option<String>,
    pub writing_mode: WritingMode,
    pub analysis: Analysis,
    pub safe_count: usize,
    pub restore_warning: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SessionAnalysis {
    pub captured_text: String,
    pub current_text: String,
    pub source_app: Option<String>,
    pub writing_mode: WritingMode,
    pub analysis: Analysis,
    pub safe_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReplacementResult {
    pub applied_text: String,
    pub restore_warning: Option<String>,
}

#[derive(Debug, Clone)]
struct SessionState {
    captured_text: String,
    current_text: String,
    writing_mode: WritingMode,
    source_app: Option<String>,
    source_hwnd: Option<isize>,
    previous_clipboard_text: Option<String>,
}

#[derive(Debug, Default)]
struct CompanionState {
    session: Mutex<Option<SessionState>>,
    settings: Mutex<CompanionSettings>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CaptureInvocation {
    Shortcut,
    FocusedUi,
}

#[tauri::command]
fn capture_selected_text(
    app: AppHandle,
    state: State<'_, CompanionState>,
) -> Result<CaptureResult, CommandError> {
    capture_selected_text_from_invocation(&app, &state, CaptureInvocation::FocusedUi)
}

#[tauri::command]
fn analyze_captured_text(
    state: State<'_, CompanionState>,
    text: Option<String>,
) -> Result<SessionAnalysis, CommandError> {
    if let Some(text) = text {
        let mut guard = state
            .session
            .lock()
            .map_err(|_| CommandError::new("Could not lock companion session."))?;
        let session = guard
            .as_mut()
            .ok_or_else(|| CommandError::new("No captured text is available."))?;
        session.current_text = text;
    }
    let session = session_snapshot(&state)?;
    Ok(analyze_session(session))
}

#[tauri::command]
fn apply_safe_to_session(state: State<'_, CompanionState>) -> Result<ApplyOutcome, CommandError> {
    let mut guard = state
        .session
        .lock()
        .map_err(|_| CommandError::new("Could not lock companion session."))?;
    let session = guard
        .as_mut()
        .ok_or_else(|| CommandError::new("No captured text is available."))?;
    let outcome = write_service::apply_safe_text(ApplySafeInput {
        text: session.current_text.clone(),
        writing_mode: session.writing_mode,
    })?;
    session.current_text = outcome.text.clone();
    Ok(outcome)
}

#[tauri::command]
fn apply_replacement_to_selection(
    app: AppHandle,
    state: State<'_, CompanionState>,
    replacement: String,
) -> Result<ReplacementResult, CommandError> {
    if replacement.is_empty() {
        return Err(CommandError::new("Replacement text is empty."));
    }

    let session = session_snapshot(&state)?;
    hide_review_window(&app);
    focus_source_window(session.source_hwnd);
    thread::sleep(Duration::from_millis(80));

    app.clipboard()
        .write_text(replacement.clone())
        .map_err(|_| CommandError::new("Could not write corrected text to the clipboard."))?;
    send_paste_shortcut()?;
    thread::sleep(Duration::from_millis(120));
    let restore_warning = restore_clipboard(&app, session.previous_clipboard_text.as_deref());

    if let Ok(mut guard) = state.session.lock()
        && let Some(active) = guard.as_mut()
    {
        active.current_text = replacement.clone();
    }

    Ok(ReplacementResult {
        applied_text: replacement,
        restore_warning,
    })
}

#[tauri::command]
fn copy_corrected_text(app: AppHandle, text: String) -> Result<(), CommandError> {
    app.clipboard()
        .write_text(text)
        .map_err(|_| CommandError::new("Could not copy corrected text to the clipboard."))
}

#[tauri::command]
fn get_companion_settings(
    app: AppHandle,
    state: State<'_, CompanionState>,
) -> Result<CompanionSettings, CommandError> {
    let loaded = load_settings(&app)?;
    let mut guard = state
        .settings
        .lock()
        .map_err(|_| CommandError::new("Could not lock companion settings."))?;
    *guard = loaded.clone();
    Ok(loaded)
}

#[tauri::command]
fn save_companion_settings(
    app: AppHandle,
    state: State<'_, CompanionState>,
    settings: CompanionSettings,
) -> Result<CompanionSettings, CommandError> {
    save_settings(&app, &settings)?;
    let mut guard = state
        .settings
        .lock()
        .map_err(|_| CommandError::new("Could not lock companion settings."))?;
    *guard = settings.clone();
    Ok(settings)
}

#[tauri::command]
fn get_companion_status(state: State<'_, CompanionState>) -> Result<CompanionStatus, CommandError> {
    let settings = state
        .settings
        .lock()
        .map_err(|_| CommandError::new("Could not lock companion settings."))?;
    Ok(CompanionStatus {
        engine_online: true,
        hotkey: settings.hotkey.clone(),
        mode: "hotkey_companion",
    })
}

#[tauri::command]
fn list_rules() -> RulesResponse {
    write_service::list_rules()
}

fn capture_selected_text_impl(
    app: &AppHandle,
    state: &CompanionState,
) -> Result<CaptureResult, CommandError> {
    let settings = state
        .settings
        .lock()
        .map_err(|_| CommandError::new("Could not lock companion settings."))?
        .clone();
    let previous_clipboard_text = app.clipboard().read_text().ok();
    let source_hwnd = foreground_window_handle();
    let source_app = foreground_window_title();
    let sequence_before = clipboard_sequence_number();

    send_copy_shortcut()?;
    let captured = wait_for_captured_text(app, previous_clipboard_text.as_deref(), sequence_before);
    let restore_warning = if settings.restore_clipboard {
        restore_clipboard(app, previous_clipboard_text.as_deref())
    } else {
        None
    };
    let captured_text =
        captured.ok_or_else(|| CommandError::new("Select text first, then press Ctrl+Alt+A."))?;

    if captured_text.chars().count() > MAX_CAPTURE_CHARS {
        return Err(CommandError::new(
            "Selected text is too large for the companion review window.",
        ));
    }

    let analysis = write_service::analyze_text(AnalyzeInput {
        text: captured_text.clone(),
        writing_mode: settings.writing_mode,
    });
    let safe_count = count_safe(&analysis.suggestions);
    let result = CaptureResult {
        captured_text: captured_text.clone(),
        current_text: captured_text.clone(),
        source_app,
        writing_mode: settings.writing_mode,
        analysis,
        safe_count,
        restore_warning,
    };

    let mut guard = state
        .session
        .lock()
        .map_err(|_| CommandError::new("Could not lock companion session."))?;
    *guard = Some(SessionState {
        captured_text,
        current_text: result.current_text.clone(),
        writing_mode: result.writing_mode,
        source_app: result.source_app.clone(),
        source_hwnd,
        previous_clipboard_text,
    });

    Ok(result)
}

fn capture_selected_text_from_invocation(
    app: &AppHandle,
    state: &CompanionState,
    invocation: CaptureInvocation,
) -> Result<CaptureResult, CommandError> {
    match invocation {
        CaptureInvocation::Shortcut => wait_for_hotkey_keys_released(),
        CaptureInvocation::FocusedUi => {
            hide_review_window(app);
            thread::sleep(FOCUS_RETURN_DELAY);
        }
    }

    let result = capture_selected_text_impl(app, state);

    if invocation == CaptureInvocation::FocusedUi {
        show_review_window(app);
    }

    result
}

fn wait_for_captured_text(
    app: &AppHandle,
    previous_text: Option<&str>,
    sequence_before: Option<u32>,
) -> Option<String> {
    for _ in 0..CAPTURE_POLL_ATTEMPTS {
        thread::sleep(CAPTURE_POLL_INTERVAL);
        let sequence_changed = match (sequence_before, clipboard_sequence_number()) {
            (Some(before), Some(after)) => after != before,
            _ => true,
        };
        if !sequence_changed {
            continue;
        }
        if let Ok(text) = app.clipboard().read_text() {
            if text.trim().is_empty() {
                continue;
            }
            if sequence_before.is_some() || previous_text != Some(text.as_str()) {
                return Some(text);
            }
        }
    }
    None
}

fn restore_clipboard(app: &AppHandle, previous: Option<&str>) -> Option<String> {
    let Some(text) = previous else {
        return Some(
            "Previous clipboard content was not text and could not be restored automatically."
                .to_owned(),
        );
    };

    app.clipboard()
        .write_text(text)
        .err()
        .map(|_| "Clipboard could not be restored automatically.".to_owned())
}

fn session_snapshot(state: &CompanionState) -> Result<SessionState, CommandError> {
    state
        .session
        .lock()
        .map_err(|_| CommandError::new("Could not lock companion session."))?
        .clone()
        .ok_or_else(|| CommandError::new("No captured text is available."))
}

fn analyze_session(session: SessionState) -> SessionAnalysis {
    let analysis = write_service::analyze_text(AnalyzeInput {
        text: session.current_text.clone(),
        writing_mode: session.writing_mode,
    });
    let safe_count = count_safe(&analysis.suggestions);
    SessionAnalysis {
        captured_text: session.captured_text,
        current_text: session.current_text,
        source_app: session.source_app,
        writing_mode: session.writing_mode,
        analysis,
        safe_count,
    }
}

fn count_safe(suggestions: &[Suggestion]) -> usize {
    suggestions
        .iter()
        .filter(|suggestion| suggestion.safe_auto_apply)
        .count()
}

fn should_capture_on_shortcut_state(state: ShortcutState) -> bool {
    state == ShortcutState::Released
}

fn settings_path(app: &AppHandle) -> Result<std::path::PathBuf, CommandError> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|_| CommandError::new("Could not resolve app config directory."))?;
    Ok(dir.join("settings.json"))
}

fn load_settings(app: &AppHandle) -> Result<CompanionSettings, CommandError> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(CompanionSettings::default());
    }
    let raw = fs::read_to_string(&path)
        .map_err(|_| CommandError::new("Could not read companion settings."))?;
    serde_json::from_str(&raw).map_err(|_| CommandError::new("Companion settings are invalid."))
}

fn save_settings(app: &AppHandle, settings: &CompanionSettings) -> Result<(), CommandError> {
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|_| CommandError::new("Could not create app config directory."))?;
    }
    let raw = serde_json::to_string_pretty(settings)
        .map_err(|_| CommandError::new("Could not serialize companion settings."))?;
    fs::write(path, raw).map_err(|_| CommandError::new("Could not save companion settings."))
}

fn show_review_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn hide_review_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

fn emit_capture_result(app: &AppHandle, state: &CompanionState, invocation: CaptureInvocation) {
    match capture_selected_text_from_invocation(app, state, invocation) {
        Ok(result) => {
            show_review_window(app);
            let _ = app.emit("companion-captured", result);
        }
        Err(error) => {
            show_review_window(app);
            let _ = app.emit("companion-error", error);
        }
    }
}

fn setup_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Review", true, None::<&str>)?;
    let check = MenuItem::with_id(app, "check", "Check Selected Text", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_id_and_items(app, "tray-menu", &[&show, &check, &settings, &quit])?;

    TrayIconBuilder::with_id("main-tray")
        .tooltip("Alfaraheedi")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" | "settings" => show_review_window(app),
            "check" => {
                let state = app.state::<CompanionState>();
                emit_capture_result(app, state.inner(), CaptureInvocation::FocusedUi);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

pub fn run() {
    let shortcut_plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_shortcut(DEFAULT_HOTKEY)
        .expect("default hotkey literal must parse")
        .with_handler(|app, _shortcut, event| {
            if should_capture_on_shortcut_state(event.state) {
                let state = app.state::<CompanionState>();
                emit_capture_result(app, state.inner(), CaptureInvocation::Shortcut);
            }
        })
        .build();

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(shortcut_plugin)
        .manage(CompanionState::default())
        .invoke_handler(tauri::generate_handler![
            capture_selected_text,
            analyze_captured_text,
            apply_safe_to_session,
            apply_replacement_to_selection,
            copy_corrected_text,
            get_companion_settings,
            save_companion_settings,
            get_companion_status,
            list_rules,
        ])
        .setup(|app| {
            let settings = load_settings(app.handle()).unwrap_or_default();
            if let Ok(mut guard) = app.state::<CompanionState>().settings.lock() {
                *guard = settings;
            }
            setup_tray(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Alfaraheedi desktop app");
}

#[cfg(windows)]
fn send_copy_shortcut() -> Result<(), CommandError> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_C;
    send_ctrl_shortcut(VK_C)
}

#[cfg(not(windows))]
fn send_copy_shortcut() -> Result<(), CommandError> {
    Err(CommandError::new(
        "Universal clipboard capture is currently implemented for Windows.",
    ))
}

#[cfg(windows)]
fn send_paste_shortcut() -> Result<(), CommandError> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_V;
    send_ctrl_shortcut(VK_V)
}

#[cfg(not(windows))]
fn send_paste_shortcut() -> Result<(), CommandError> {
    Err(CommandError::new(
        "Universal clipboard paste is currently implemented for Windows.",
    ))
}

#[cfg(windows)]
fn send_ctrl_shortcut(key: u16) -> Result<(), CommandError> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, SendInput, VK_CONTROL,
    };

    fn keyboard_input(key: u16, flags: u32) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: key,
                    wScan: 0,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    let inputs = [
        keyboard_input(VK_CONTROL, 0),
        keyboard_input(key, 0),
        keyboard_input(key, KEYEVENTF_KEYUP),
        keyboard_input(VK_CONTROL, KEYEVENTF_KEYUP),
    ];
    let sent = unsafe {
        SendInput(
            inputs.len() as u32,
            inputs.as_ptr(),
            std::mem::size_of::<INPUT>() as i32,
        )
    };
    if sent == inputs.len() as u32 {
        Ok(())
    } else {
        Err(CommandError::new("Could not send keyboard shortcut."))
    }
}

#[cfg(windows)]
fn wait_for_hotkey_keys_released() {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_CONTROL, VK_MENU};

    const VK_A: i32 = b'A' as i32;
    let keys = [VK_CONTROL as i32, VK_MENU as i32, VK_A];
    let start = Instant::now();
    while start.elapsed() < HOTKEY_RELEASE_TIMEOUT {
        let any_pressed = keys
            .iter()
            .any(|key| unsafe { GetAsyncKeyState(*key) as u16 & 0x8000 != 0 });
        if !any_pressed {
            return;
        }
        thread::sleep(HOTKEY_RELEASE_POLL_INTERVAL);
    }
}

#[cfg(not(windows))]
fn wait_for_hotkey_keys_released() {}

#[cfg(windows)]
fn foreground_window_handle() -> Option<isize> {
    use windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
    let hwnd = unsafe { GetForegroundWindow() };
    (!hwnd.is_null()).then_some(hwnd as isize)
}

#[cfg(not(windows))]
fn foreground_window_handle() -> Option<isize> {
    None
}

#[cfg(windows)]
fn focus_source_window(hwnd: Option<isize>) {
    use windows_sys::Win32::UI::WindowsAndMessaging::SetForegroundWindow;
    if let Some(hwnd) = hwnd {
        unsafe {
            SetForegroundWindow(hwnd as _);
        }
    }
}

#[cfg(not(windows))]
fn focus_source_window(_hwnd: Option<isize>) {}

#[cfg(windows)]
fn foreground_window_title() -> Option<String> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW,
    };

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return None;
        }
        let len = GetWindowTextLengthW(hwnd);
        if len <= 0 {
            return None;
        }
        let mut buffer = vec![0u16; len as usize + 1];
        let written = GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32);
        if written <= 0 {
            return None;
        }
        Some(String::from_utf16_lossy(&buffer[..written as usize]))
    }
}

#[cfg(not(windows))]
fn foreground_window_title() -> Option<String> {
    None
}

#[cfg(windows)]
fn clipboard_sequence_number() -> Option<u32> {
    use windows_sys::Win32::System::DataExchange::GetClipboardSequenceNumber;
    let sequence = unsafe { GetClipboardSequenceNumber() };
    (sequence != 0).then_some(sequence)
}

#[cfg(not(windows))]
fn clipboard_sequence_number() -> Option<u32> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_are_privacy_first() {
        let settings = CompanionSettings::default();

        assert_eq!(settings.ui_language, "ar");
        assert_eq!(settings.writing_mode, WritingMode::Auto);
        assert_eq!(settings.hotkey, DEFAULT_HOTKEY);
        assert!(settings.restore_clipboard);
        assert!(!settings.first_run_privacy_seen);
    }

    #[test]
    fn session_analysis_counts_safe_suggestions_without_storing_raw_text_elsewhere() {
        let session = SessionState {
            captured_text: "مرحبــا  بالعالم".to_owned(),
            current_text: "مرحبــا  بالعالم".to_owned(),
            writing_mode: WritingMode::Arabic,
            source_app: Some("Notepad".to_owned()),
            source_hwnd: None,
            previous_clipboard_text: Some("clipboard".to_owned()),
        };

        let analysis = analyze_session(session);

        assert_eq!(analysis.safe_count, 2);
        assert_eq!(analysis.source_app.as_deref(), Some("Notepad"));
        assert_eq!(analysis.current_text, "مرحبــا  بالعالم");
    }

    #[test]
    fn shortcut_capture_runs_after_hotkey_release() {
        assert!(!should_capture_on_shortcut_state(ShortcutState::Pressed));
        assert!(should_capture_on_shortcut_state(ShortcutState::Released));
    }
}
