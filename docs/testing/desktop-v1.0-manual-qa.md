# Nahou Desktop v1.0 Manual QA

This template records real-app desktop companion checks for v1.0. Do not mark a row passed unless it was run against the packaged desktop app or the explicitly named local desktop build.

## Build Under Test

- Version: 1.0.0-rc.1
- Git revision: release/v1.0 based on `46925dd4c92489efd229368eeb6a7bf32899c69c`
- Build path: `target/release/bundle/nsis/Nahou-1.0.0-rc.1-windows-x64-setup.exe`
- Artifact SHA256: `60C080871ED14F96348CB58587F6ED3713864B59F18195F7E769B887C8966D8C`
- Windows version: Agent-Dev-01 canonical Windows VM plus local Windows host installer and desktop checks
- Tester: Codex backend automation plus local installed-app desktop QA
- Date: 2026-06-30

## Foundation Required Checks

The v1.0 foundation release blocks on the packaged desktop selected-text path,
no-selection or unsupported-selection behavior, and public-safe diagnostics.
Broader app matrix rows remain tracked below as deferred integration or
hardening gates, not as desktop-foundation blockers.

| Case | Steps | Expected result | Status | Evidence / notes |
| --- | --- | --- | --- | --- |
| Notepad: UIA or clipboard capture label and apply path | Type Arabic, English, and mixed text in Notepad. Select a sentence. Use the hotkey, then repeat with the tray Check Selected Text action. Apply a safe correction with Replace selection or copy corrected text. | Review window opens, capture label says Windows UI Automation or clipboard fallback, source app is visible when available, and the apply path avoids raw text in logs. | Pass for packaged hotkey capture, corrected-copy, and Replace Selection apply paths | User-PC installed RC captured selected public-safe Notepad text with the explicit **Check selected text** button, showed source `Notepad`, showed character count, and rendered a deterministic tatweel-removal suggestion. Agent-Dev-01 packaged-app `Ctrl+Alt+A` Notepad capture passed on 2026-06-29 after the Windows capture fallback fix; private evidence is `C:\AgentArtifacts\nahou-v1-rc1-desktop-qa\20260629T141553621Z\hotkey-final-pass-probe.json`, which records hotkey ownership, Notepad foreground, preflight selected-text copy success, `captureStatus.status = ok`, invocation `shortcut`, method `clipboard_shortcut`, positive captured character count, and no raw selected text. Agent-Dev-01 packaged-app foundation apply proof passed on 2026-06-30 at `C:\AgentArtifacts\nahou-v1-rc1-replace-selection-fix\20260630T052303777Z\apply-copy-replace-probe.json`: preflight selected text matched the deterministic Arabic fixture, capture status was `ok`, invocation `shortcut`, method `clipboard_shortcut`, `captured_char_count = 16`, `safe_count = 2`, **Apply Safe Fixes** was clicked, **Copy Corrected Text** copied the expected 13-character corrected text by SHA256, and **Replace Selection** changed Notepad to the same expected 13-character corrected text by SHA256 without storing raw text in the report. |
| Browser textarea: fallback path | Select text inside a browser textarea. Use the hotkey and then the tray action. | Review window opens or shows a clear unsupported-app/no-selected-text message. Clipboard fallback is labeled when used and clipboard restore warning appears if restore fails. | Deferred | Tracked for post-foundation app-matrix hardening; not a v1.0 desktop-foundation blocker. |
| Word: selected paragraph | Select a paragraph in Microsoft Word. Use the hotkey and tray action. | Selected paragraph is captured through UIA or clipboard fallback, suggestions are local, and replacement remains on clipboard paste. | Deferred | Tracked separately through Office add-in and desktop integration gates; not a v1.0 desktop-foundation blocker. |
| PowerPoint: selected text box | Select text in a PowerPoint text box. Use the hotkey and tray action. | Selected text is captured or a clear unsupported-app message appears. The app does not claim UIA replacement support. | Deferred | Tracked separately through Office add-in and desktop integration gates; not a v1.0 desktop-foundation blocker. |
| WhatsApp Web: composed message text | Select composed message text in WhatsApp Web. Use the hotkey and tray action. | Text is captured through supported path or a clear unsupported-app/no-selected-text message appears. No message is sent by Nahou. | Deferred | Tracked for future live web-editor QA; not a v1.0 desktop-foundation blocker. |
| No selection | Focus each target app with no selected text and use the hotkey. | User sees "This app did not expose selected text" or the equivalent localized message. No raw text appears in the error. | Pass for hotkey guard | Agent-Dev-01 packaged-app no-selection hotkey proof passed on 2026-06-30 at `C:\AgentArtifacts\nahou-v1-rc1-replace-selection-fix\20260630T052735198Z\no-selection-hotkey-probe.json`: foreground was `Untitled - Notepad`, invocation was `shortcut`, capture method was `clipboard_shortcut`, status was `error`, `error_category = no_selected_text`, `no_selected_text = true`, no captured character count was recorded, and the sentinel clipboard remained unchanged. With the installed RC focused and no external selected text, the explicit check path also kept the localized "Select text first, then press Ctrl+Alt+A" state and did not expose raw text. |
| Large selection | Select text above the desktop capture limit and use the hotkey. | Nahou refuses the selection by default and shows a size warning. No review session is stored for the oversized text. | Deferred | Tracked for post-foundation hardening. |
| Binary clipboard | Put image or other non-text data on the clipboard, then run a normal text capture. | Text capture works when selected text is available. Clipboard restore succeeds when possible or shows a restore warning. | Deferred | Tracked for post-foundation clipboard hardening. |
| Arabic UI | Switch interface language to Arabic. Run a capture and review suggestions. | UI is RTL where expected, capture status and privacy copy are localized, and writing mode remains independent of UI language. | Deferred | Tracked for post-foundation localization hardening. |
| English UI | Switch interface language to English. Run a capture and review suggestions. | UI is LTR, capture status and privacy copy are clear, and writing mode remains independent of UI language. | Deferred | Tracked for post-foundation localization hardening. |
| Offline mode | Disconnect network and run deterministic capture/review flow without local LLM runtime configured. | Desktop capture and deterministic suggestions still work locally. LLM controls remain unavailable/skipped unless a separate loopback runtime is configured. | Deferred | Local LLM no-runtime behavior is verified by doctor skip and mock-runtime smoke; full offline desktop capture is tracked for post-foundation hardening. |

## Privacy And Diagnostics Review

- First-run privacy text review: pass on the installed host RC window; the visible copy states selected text is copied locally only after the shortcut, no hosted service or tracking is used, and clipboard restore is attempted when possible.
- Capture diagnostics review: pass for the `NAHOU_QA_CAPTURE_STATUS_PATH` QA status path by code/test review and Agent-Dev-01 packaged-app evidence; it records status, invocation, method, category flags, counts, and source-app metadata only, not raw selected text. The 2026-06-30 apply/no-selection foundation reports additionally store fixture counts and hashes rather than raw selected text.
- Logs captured during QA: public report contains no raw selected text; ignored private VM artifacts must remain out of source control.
