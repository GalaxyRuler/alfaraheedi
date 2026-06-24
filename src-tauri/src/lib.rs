use std::{
    fs,
    sync::{
        Mutex,
        atomic::{AtomicU64, Ordering},
    },
    thread,
    time::Duration,
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
use write_llm::{LlmDoctorReport, LlmStatus, LlmSuggestion};
use write_service::{AnalyzeInput, ApplySafeInput, LlmSuggestInput, RulesResponse, WritingMode};

mod uia_pilot;

const DEFAULT_HOTKEY: &str = "Ctrl+Alt+A";
const MAX_CAPTURE_CHARS: usize = 20_000;
const CAPTURE_POLL_ATTEMPTS: usize = 12;
const CAPTURE_POLL_INTERVAL: Duration = Duration::from_millis(45);
const FOCUS_RETURN_DELAY: Duration = Duration::from_millis(180);
#[cfg(windows)]
const HOTKEY_RELEASE_TIMEOUT: Duration = Duration::from_millis(700);
#[cfg(windows)]
const HOTKEY_RELEASE_POLL_INTERVAL: Duration = Duration::from_millis(20);

#[derive(Debug, Clone, Serialize)]
pub struct CommandError {
    message: String,
    category: ErrorCategory,
    #[serde(skip_serializing_if = "Option::is_none")]
    diagnostic: Option<CaptureDiagnostic>,
}

impl CommandError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            category: ErrorCategory::OperationFailed,
            diagnostic: None,
        }
    }

    fn categorized(message: impl Into<String>, category: ErrorCategory) -> Self {
        Self {
            message: message.into(),
            category,
            diagnostic: None,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCategory {
    NoSelectedText,
    ClipboardUnavailable,
    AppBlockedCopy,
    LargeSelection,
    OperationFailed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompanionSettings {
    pub ui_language: String,
    pub writing_mode: WritingMode,
    pub hotkey: String,
    pub restore_clipboard: bool,
    pub first_run_privacy_seen: bool,
    #[serde(default)]
    pub capture_preference: CapturePreference,
    #[serde(default)]
    pub llm_base_url: String,
    #[serde(default = "default_llm_model_id")]
    pub llm_model_id: String,
    #[serde(default = "default_llm_timeout_ms")]
    pub llm_timeout_ms: u64,
}

impl Default for CompanionSettings {
    fn default() -> Self {
        Self {
            ui_language: "ar".to_owned(),
            writing_mode: WritingMode::Auto,
            hotkey: DEFAULT_HOTKEY.to_owned(),
            restore_clipboard: true,
            first_run_privacy_seen: false,
            capture_preference: CapturePreference::Auto,
            llm_base_url: String::new(),
            llm_model_id: default_llm_model_id(),
            llm_timeout_ms: default_llm_timeout_ms(),
        }
    }
}

fn default_llm_model_id() -> String {
    write_llm::DEFAULT_MODEL_ID.to_owned()
}

fn default_llm_timeout_ms() -> u64 {
    write_llm::DEFAULT_TIMEOUT_MS
}

#[derive(Debug, Clone, Serialize)]
pub struct CompanionStatus {
    pub engine_online: bool,
    pub hotkey: String,
    pub mode: &'static str,
    pub uia_pilot: uia_pilot::UiaPilotStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CaptureMethod {
    WindowsUiaTextPattern,
    ClipboardShortcut,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CapturePreference {
    #[default]
    Auto,
    UiaFirst,
    ClipboardFirst,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CaptureAttempt {
    Uia,
    Clipboard,
}

#[derive(Debug, Clone, Serialize)]
pub struct CaptureDiagnostic {
    pub method: CaptureMethod,
    pub source_app: Option<String>,
    pub error_category: Option<ErrorCategory>,
    pub no_selected_text: bool,
    pub clipboard_unavailable: bool,
    pub app_blocked_copy: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct CaptureResult {
    pub captured_text: String,
    pub current_text: String,
    pub source_app: Option<String>,
    pub capture_method: CaptureMethod,
    pub writing_mode: WritingMode,
    pub analysis: Analysis,
    pub safe_count: usize,
    pub restore_warning: Option<String>,
    pub diagnostic: CaptureDiagnostic,
}

#[derive(Debug, Clone, Serialize)]
pub struct SessionAnalysis {
    pub captured_text: String,
    pub current_text: String,
    pub source_app: Option<String>,
    pub capture_method: CaptureMethod,
    pub writing_mode: WritingMode,
    pub analysis: Analysis,
    pub safe_count: usize,
    pub diagnostic: CaptureDiagnostic,
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
    capture_method: CaptureMethod,
    previous_clipboard_text: Option<String>,
}

struct LlmCancelHandle {
    request_id: u64,
    sender: tokio::sync::watch::Sender<bool>,
}

struct LlmRequestRegistration {
    request_id: u64,
    cancelled: tokio::sync::watch::Receiver<bool>,
}

#[derive(Default)]
struct CompanionState {
    session: Mutex<Option<SessionState>>,
    settings: Mutex<CompanionSettings>,
    llm_request_counter: AtomicU64,
    llm_cancel: Mutex<Option<LlmCancelHandle>>,
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
        uia_pilot: uia_pilot::status(),
    })
}

#[tauri::command]
fn get_uia_pilot_status() -> uia_pilot::UiaPilotStatus {
    uia_pilot::status()
}

#[tauri::command]
async fn get_companion_llm_status(
    state: State<'_, CompanionState>,
) -> Result<LlmStatus, CommandError> {
    let settings = state
        .settings
        .lock()
        .map_err(|_| CommandError::new("Could not lock companion settings."))?
        .clone();
    Ok(llm_status_from_settings(&settings).await)
}

#[tauri::command]
async fn run_companion_llm_doctor(
    state: State<'_, CompanionState>,
) -> Result<LlmDoctorReport, CommandError> {
    let settings = state
        .settings
        .lock()
        .map_err(|_| CommandError::new("Could not lock companion settings."))?
        .clone();
    Ok(llm_doctor_from_settings(&settings).await)
}

#[tauri::command]
async fn suggest_with_local_llm_for_session(
    state: State<'_, CompanionState>,
) -> Result<LlmSuggestion, CommandError> {
    let settings = state
        .settings
        .lock()
        .map_err(|_| CommandError::new("Could not lock companion settings."))?
        .clone();
    let session = session_snapshot(&state)?;

    let registration = register_llm_request(&state)?;
    let request_id = registration.request_id;
    let mut cancelled = registration.cancelled;
    let result = tokio::select! {
        result = llm_suggestion_from_settings(&settings, &session) => result,
        changed = cancelled.changed() => {
            match changed {
                Ok(()) if *cancelled.borrow() => {
                    Err(CommandError::new("Local LLM suggestion was cancelled."))
                }
                _ => Err(CommandError::new("Local LLM suggestion was cancelled.")),
            }
        }
    };
    clear_llm_request(&state, request_id);
    result
}

#[tauri::command]
fn cancel_companion_llm_suggestion(state: State<'_, CompanionState>) -> Result<bool, CommandError> {
    cancel_active_llm_request(&state)
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

    let mut last_error = None;
    for attempt in capture_attempt_order(settings.capture_preference) {
        match attempt {
            CaptureAttempt::Uia => {
                if let Ok(captured) = uia_pilot::try_capture_selected_text()
                    && !captured.text.trim().is_empty()
                {
                    let context = CapturedTextContext {
                        source_app: source_app.clone(),
                        source_hwnd,
                        capture_method: CaptureMethod::WindowsUiaTextPattern,
                        previous_clipboard_text: previous_clipboard_text.clone(),
                        restore_warning: None,
                        error_category: None,
                    };
                    return build_capture_result(state, settings, captured.text, context);
                }
                last_error = Some((ErrorCategory::NoSelectedText, CaptureAttempt::Uia));
            }
            CaptureAttempt::Clipboard => {
                match capture_via_clipboard(app, &settings, previous_clipboard_text.as_deref()) {
                    Ok((captured_text, restore_warning)) => {
                        let context = CapturedTextContext {
                            source_app: source_app.clone(),
                            source_hwnd,
                            capture_method: CaptureMethod::ClipboardShortcut,
                            previous_clipboard_text: previous_clipboard_text.clone(),
                            restore_warning,
                            error_category: None,
                        };
                        return build_capture_result(state, settings, captured_text, context);
                    }
                    Err(category) => {
                        last_error = Some((category, CaptureAttempt::Clipboard));
                        if !should_try_next_capture_attempt(
                            settings.capture_preference,
                            attempt,
                            category,
                        ) {
                            break;
                        }
                    }
                }
            }
        }
    }

    let (category, attempt) =
        last_error.unwrap_or((ErrorCategory::NoSelectedText, CaptureAttempt::Uia));
    Err(capture_error(category, attempt.into(), source_app))
}

fn capture_via_clipboard(
    app: &AppHandle,
    settings: &CompanionSettings,
    previous_clipboard_text: Option<&str>,
) -> Result<(String, Option<String>), ErrorCategory> {
    let sequence_before = clipboard_sequence_number();

    send_copy_shortcut().map_err(|_| ErrorCategory::ClipboardUnavailable)?;
    let captured = wait_for_captured_text(app, previous_clipboard_text, sequence_before);
    let restore_warning = if settings.restore_clipboard {
        restore_clipboard(app, previous_clipboard_text)
    } else {
        None
    };
    let Some(captured_text) = captured else {
        return Err(
            if sequence_before.is_some() && clipboard_sequence_number() == sequence_before {
                ErrorCategory::AppBlockedCopy
            } else {
                ErrorCategory::NoSelectedText
            },
        );
    };

    Ok((captured_text, restore_warning))
}

fn capture_attempt_order(preference: CapturePreference) -> [CaptureAttempt; 2] {
    match preference {
        CapturePreference::Auto | CapturePreference::UiaFirst => {
            [CaptureAttempt::Uia, CaptureAttempt::Clipboard]
        }
        CapturePreference::ClipboardFirst => [CaptureAttempt::Clipboard, CaptureAttempt::Uia],
    }
}

fn should_try_next_capture_attempt(
    preference: CapturePreference,
    attempt: CaptureAttempt,
    category: ErrorCategory,
) -> bool {
    !matches!(
        (preference, attempt, category),
        (
            CapturePreference::ClipboardFirst,
            CaptureAttempt::Clipboard,
            ErrorCategory::NoSelectedText
        )
    )
}

impl From<CaptureAttempt> for CaptureMethod {
    fn from(attempt: CaptureAttempt) -> Self {
        match attempt {
            CaptureAttempt::Uia => CaptureMethod::WindowsUiaTextPattern,
            CaptureAttempt::Clipboard => CaptureMethod::ClipboardShortcut,
        }
    }
}

fn capture_error(
    category: ErrorCategory,
    method: CaptureMethod,
    source_app: Option<String>,
) -> CommandError {
    let message = match category {
        ErrorCategory::NoSelectedText => {
            "This app did not expose selected text. Select text first, then press Ctrl+Alt+A."
        }
        ErrorCategory::ClipboardUnavailable => "Clipboard capture is unavailable.",
        ErrorCategory::AppBlockedCopy => "The source app did not copy selected text for Nahou.",
        ErrorCategory::LargeSelection => {
            "Selected text is too large. Nahou refuses large selections by default."
        }
        ErrorCategory::OperationFailed => "Could not capture selected text.",
    };
    let mut error = CommandError::categorized(message, category);
    error.diagnostic = Some(capture_diagnostic(method, source_app, Some(category)));
    error
}

struct CapturedTextContext {
    source_app: Option<String>,
    source_hwnd: Option<isize>,
    capture_method: CaptureMethod,
    previous_clipboard_text: Option<String>,
    restore_warning: Option<String>,
    error_category: Option<ErrorCategory>,
}

fn capture_diagnostic(
    method: CaptureMethod,
    source_app: Option<String>,
    error_category: Option<ErrorCategory>,
) -> CaptureDiagnostic {
    CaptureDiagnostic {
        method,
        source_app,
        error_category,
        no_selected_text: error_category == Some(ErrorCategory::NoSelectedText),
        clipboard_unavailable: error_category == Some(ErrorCategory::ClipboardUnavailable),
        app_blocked_copy: error_category == Some(ErrorCategory::AppBlockedCopy),
    }
}

fn build_capture_result(
    state: &CompanionState,
    settings: CompanionSettings,
    captured_text: String,
    context: CapturedTextContext,
) -> Result<CaptureResult, CommandError> {
    if captured_text.chars().count() > MAX_CAPTURE_CHARS {
        return Err(capture_error(
            ErrorCategory::LargeSelection,
            context.capture_method,
            context.source_app,
        ));
    }

    let source_app = context.source_app.clone();
    let analysis = write_service::analyze_text(AnalyzeInput {
        text: captured_text.clone(),
        writing_mode: settings.writing_mode,
    });
    let safe_count = count_safe(&analysis.suggestions);
    let result = CaptureResult {
        captured_text: captured_text.clone(),
        current_text: captured_text.clone(),
        source_app: source_app.clone(),
        capture_method: context.capture_method,
        writing_mode: settings.writing_mode,
        analysis,
        safe_count,
        restore_warning: context.restore_warning,
        diagnostic: capture_diagnostic(context.capture_method, source_app, context.error_category),
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
        source_hwnd: context.source_hwnd,
        capture_method: context.capture_method,
        previous_clipboard_text: context.previous_clipboard_text,
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
    let source_app = session.source_app;
    SessionAnalysis {
        captured_text: session.captured_text,
        current_text: session.current_text,
        source_app: source_app.clone(),
        capture_method: session.capture_method,
        writing_mode: session.writing_mode,
        analysis,
        safe_count,
        diagnostic: capture_diagnostic(session.capture_method, source_app, None),
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

fn llm_config_from_settings(
    settings: &CompanionSettings,
) -> Result<Option<write_llm::LlmRuntimeConfig>, CommandError> {
    let base_url = settings.llm_base_url.trim();
    if base_url.is_empty() {
        return Ok(None);
    }
    write_llm::validate_local_base_url(base_url).map_err(CommandError::new)?;
    write_llm::validate_timeout_ms(settings.llm_timeout_ms).map_err(CommandError::new)?;

    let model_id = settings.llm_model_id.trim();
    let model_id = if model_id.is_empty() {
        write_llm::DEFAULT_MODEL_ID
    } else {
        model_id
    };

    Ok(Some(write_llm::LlmRuntimeConfig::new(
        base_url,
        model_id,
        settings.llm_timeout_ms,
    )))
}

fn register_llm_request(state: &CompanionState) -> Result<LlmRequestRegistration, CommandError> {
    let request_id = state.llm_request_counter.fetch_add(1, Ordering::Relaxed) + 1;
    let (sender, cancelled) = tokio::sync::watch::channel(false);
    let mut guard = state
        .llm_cancel
        .lock()
        .map_err(|_| CommandError::new("Could not lock local LLM cancellation state."))?;
    if let Some(active) = guard.take() {
        let _ = active.sender.send(true);
    }
    *guard = Some(LlmCancelHandle { request_id, sender });
    Ok(LlmRequestRegistration {
        request_id,
        cancelled,
    })
}

fn cancel_active_llm_request(state: &CompanionState) -> Result<bool, CommandError> {
    let mut guard = state
        .llm_cancel
        .lock()
        .map_err(|_| CommandError::new("Could not lock local LLM cancellation state."))?;
    let Some(active) = guard.take() else {
        return Ok(false);
    };
    let _ = active.sender.send(true);
    Ok(true)
}

fn clear_llm_request(state: &CompanionState, request_id: u64) {
    if let Ok(mut guard) = state.llm_cancel.lock()
        && guard
            .as_ref()
            .is_some_and(|active| active.request_id == request_id)
    {
        *guard = None;
    }
}

async fn llm_status_from_settings(settings: &CompanionSettings) -> LlmStatus {
    match llm_config_from_settings(settings) {
        Ok(Some(config)) => write_service::llm_status(Some(&config)).await,
        Ok(None) => write_service::llm_status(None).await,
        Err(error) => LlmStatus {
            available: false,
            reason: error.to_string(),
            runtime: None,
            catalog: write_llm::builtin_catalog(),
        },
    }
}

async fn llm_doctor_from_settings(settings: &CompanionSettings) -> LlmDoctorReport {
    match llm_config_from_settings(settings) {
        Ok(Some(config)) => write_service::llm_doctor(Some(&config)).await,
        Ok(None) => write_service::llm_doctor(None).await,
        Err(error) => write_llm::LlmDoctorReport {
            ok: false,
            available: false,
            summary: "local LLM doctor found blocking configuration issues".to_owned(),
            runtime: None,
            catalog: write_llm::builtin_catalog(),
            checks: vec![write_llm::LlmDoctorCheck {
                name: "runtime_config".to_owned(),
                outcome: write_llm::LlmDoctorOutcome::Fail,
                message: error.to_string(),
            }],
        },
    }
}

async fn llm_suggestion_from_settings(
    settings: &CompanionSettings,
    session: &SessionState,
) -> Result<LlmSuggestion, CommandError> {
    let config = llm_config_from_settings(settings)?
        .ok_or_else(|| CommandError::new(write_llm::LlmError::NotConfigured.to_string()))?;

    write_service::llm_suggest(
        &config,
        LlmSuggestInput {
            text: session.current_text.clone(),
            writing_mode: session.writing_mode,
            selection: None,
        },
    )
    .await
    .map_err(|error| CommandError::new(error.to_string()))
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
        .tooltip("Nahou")
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
            get_companion_llm_status,
            run_companion_llm_doctor,
            suggest_with_local_llm_for_session,
            cancel_companion_llm_suggestion,
            get_uia_pilot_status,
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
        .expect("error while running Nahou desktop app");
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
    let start = std::time::Instant::now();
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
        assert_eq!(settings.capture_preference, CapturePreference::Auto);
    }

    #[test]
    fn default_settings_keep_local_llm_disabled_but_configurable() {
        let settings = CompanionSettings::default();

        assert_eq!(settings.llm_base_url, "");
        assert_eq!(settings.llm_model_id, write_llm::DEFAULT_MODEL_ID);
        assert_eq!(settings.llm_timeout_ms, write_llm::DEFAULT_TIMEOUT_MS);
        assert!(
            llm_config_from_settings(&settings)
                .expect("valid config")
                .is_none()
        );
    }

    #[test]
    fn old_settings_files_get_local_llm_defaults() {
        let settings: CompanionSettings = serde_json::from_str(
            r#"{
              "ui_language": "en",
              "writing_mode": "mixed",
              "hotkey": "Ctrl+Alt+A",
              "restore_clipboard": true,
              "first_run_privacy_seen": true
            }"#,
        )
        .expect("old settings remain readable");

        assert_eq!(settings.llm_base_url, "");
        assert_eq!(settings.llm_model_id, write_llm::DEFAULT_MODEL_ID);
        assert_eq!(settings.llm_timeout_ms, write_llm::DEFAULT_TIMEOUT_MS);
        assert_eq!(settings.capture_preference, CapturePreference::Auto);
    }

    #[test]
    fn capture_preference_controls_capture_attempt_order() {
        assert_eq!(
            capture_attempt_order(CapturePreference::Auto),
            [CaptureAttempt::Uia, CaptureAttempt::Clipboard]
        );
        assert_eq!(
            capture_attempt_order(CapturePreference::UiaFirst),
            [CaptureAttempt::Uia, CaptureAttempt::Clipboard]
        );
        assert_eq!(
            capture_attempt_order(CapturePreference::ClipboardFirst),
            [CaptureAttempt::Clipboard, CaptureAttempt::Uia]
        );
    }

    #[test]
    fn clipboard_first_stops_after_clipboard_mutation_risk() {
        assert!(!should_try_next_capture_attempt(
            CapturePreference::ClipboardFirst,
            CaptureAttempt::Clipboard,
            ErrorCategory::NoSelectedText,
        ));
        assert!(should_try_next_capture_attempt(
            CapturePreference::ClipboardFirst,
            CaptureAttempt::Clipboard,
            ErrorCategory::AppBlockedCopy,
        ));
    }

    #[test]
    fn capture_errors_are_categorized_without_raw_text() {
        let error = capture_error(
            ErrorCategory::LargeSelection,
            CaptureMethod::ClipboardShortcut,
            Some("Notepad".to_owned()),
        );

        assert_eq!(error.category, ErrorCategory::LargeSelection);
        let diagnostic = error
            .diagnostic
            .as_ref()
            .expect("capture errors include diagnostics");
        assert_eq!(diagnostic.source_app, Some("Notepad".to_owned()));
        assert_eq!(
            diagnostic.error_category,
            Some(ErrorCategory::LargeSelection)
        );
        assert!(error.to_string().contains("refuses large selections"));
        assert!(!error.to_string().contains("مرحب"));
    }

    #[test]
    fn settings_build_local_llm_runtime_config() {
        let settings = CompanionSettings {
            llm_base_url: " http://127.0.0.1:8080/ ".to_owned(),
            llm_model_id: "custom-local-model".to_owned(),
            llm_timeout_ms: 45_000,
            ..CompanionSettings::default()
        };

        let config = llm_config_from_settings(&settings)
            .expect("valid config")
            .expect("configured runtime");

        assert_eq!(config.base_url, "http://127.0.0.1:8080");
        assert_eq!(config.model_id, "custom-local-model");
        assert_eq!(config.timeout_ms, 45_000);
    }

    #[test]
    fn settings_reject_non_loopback_llm_runtime_url() {
        let settings = CompanionSettings {
            llm_base_url: "https://example.com".to_owned(),
            ..CompanionSettings::default()
        };

        let error = llm_config_from_settings(&settings).expect_err("non-local runtime rejected");

        assert!(error.to_string().contains("local loopback runtime"));
    }

    #[test]
    fn settings_reject_out_of_range_llm_timeout() {
        let settings = CompanionSettings {
            llm_base_url: "http://127.0.0.1:8080".to_owned(),
            llm_timeout_ms: 0,
            ..CompanionSettings::default()
        };

        let error = llm_config_from_settings(&settings).expect_err("invalid timeout rejected");

        assert!(error.to_string().to_ascii_lowercase().contains("timeout"));
    }

    #[test]
    fn llm_status_from_unconfigured_settings_is_unavailable() {
        let status =
            tauri::async_runtime::block_on(llm_status_from_settings(&CompanionSettings::default()));

        assert!(!status.available);
        assert!(status.reason.contains("not configured"));
        assert!(status.runtime.is_none());
        assert_eq!(
            status.catalog.policy.default_model_id,
            write_llm::DEFAULT_MODEL_ID
        );
    }

    #[test]
    fn llm_doctor_from_unconfigured_settings_skips_live_checks() {
        let report =
            tauri::async_runtime::block_on(llm_doctor_from_settings(&CompanionSettings::default()));

        assert!(report.ok);
        assert!(!report.available);
        assert!(report.summary.contains("skipped live runtime checks"));
        assert!(
            report
                .checks
                .iter()
                .any(|check| check.name == "runtime_config"
                    && check.outcome == write_llm::LlmDoctorOutcome::Skip)
        );
    }

    #[test]
    fn llm_suggestion_requires_configured_local_runtime() {
        let session = SessionState {
            captured_text: "helo wat you are do?".to_owned(),
            current_text: "helo wat you are do?".to_owned(),
            writing_mode: WritingMode::English,
            source_app: Some("Notepad".to_owned()),
            source_hwnd: None,
            capture_method: CaptureMethod::ClipboardShortcut,
            previous_clipboard_text: None,
        };

        let error = tauri::async_runtime::block_on(llm_suggestion_from_settings(
            &CompanionSettings::default(),
            &session,
        ))
        .expect_err("runtime required");

        assert!(error.to_string().contains("ALFARAHEEDI_LLM_BASE_URL"));
    }

    #[test]
    fn cancelling_active_llm_request_signals_receiver_and_clears_state() {
        let state = CompanionState::default();
        let mut registration = register_llm_request(&state).expect("register request");

        assert!(cancel_active_llm_request(&state).expect("cancel request"));
        tauri::async_runtime::block_on(registration.cancelled.changed()).expect("cancel signal");
        assert!(*registration.cancelled.borrow());
        assert!(!cancel_active_llm_request(&state).expect("already cancelled"));
    }

    #[test]
    fn session_analysis_counts_safe_suggestions_without_storing_raw_text_elsewhere() {
        let session = SessionState {
            captured_text: "مرحبــا  بالعالم".to_owned(),
            current_text: "مرحبــا  بالعالم".to_owned(),
            writing_mode: WritingMode::Arabic,
            source_app: Some("Notepad".to_owned()),
            source_hwnd: None,
            capture_method: CaptureMethod::WindowsUiaTextPattern,
            previous_clipboard_text: Some("clipboard".to_owned()),
        };

        let analysis = analyze_session(session);

        assert_eq!(analysis.safe_count, 2);
        assert_eq!(analysis.source_app.as_deref(), Some("Notepad"));
        assert_eq!(
            analysis.capture_method,
            CaptureMethod::WindowsUiaTextPattern
        );
        assert_eq!(analysis.current_text, "مرحبــا  بالعالم");
    }

    #[test]
    fn shortcut_capture_runs_after_hotkey_release() {
        assert!(!should_capture_on_shortcut_state(ShortcutState::Pressed));
        assert!(should_capture_on_shortcut_state(ShortcutState::Released));
    }
}
