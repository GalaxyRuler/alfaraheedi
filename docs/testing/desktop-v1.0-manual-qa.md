# Nahou Desktop v1.0 Manual QA

This template records real-app desktop companion checks for v1.0. Do not mark a row passed unless it was run against the packaged desktop app or the explicitly named local desktop build.

## Build Under Test

- Version:
- Git revision:
- Build path:
- Windows version:
- Tester:
- Date:

## Required Checks

| Case | Steps | Expected result | Status | Evidence / notes |
| --- | --- | --- | --- | --- |
| Notepad: UIA or clipboard capture label and replace selection | Type Arabic, English, and mixed text in Notepad. Select a sentence. Use the hotkey, then repeat with the tray Check Selected Text action. Apply a safe correction with Replace selection. | Review window opens, capture label says Windows UI Automation or clipboard fallback, source app is visible when available, and replacement uses clipboard paste without raw text in logs. | Not run | |
| Browser textarea: fallback path | Select text inside a browser textarea. Use the hotkey and then the tray action. | Review window opens or shows a clear unsupported-app/no-selected-text message. Clipboard fallback is labeled when used and clipboard restore warning appears if restore fails. | Not run | |
| Word: selected paragraph | Select a paragraph in Microsoft Word. Use the hotkey and tray action. | Selected paragraph is captured through UIA or clipboard fallback, suggestions are local, and replacement remains on clipboard paste. | Not run | |
| PowerPoint: selected text box | Select text in a PowerPoint text box. Use the hotkey and tray action. | Selected text is captured or a clear unsupported-app message appears. The app does not claim UIA replacement support. | Not run | |
| WhatsApp Web: composed message text | Select composed message text in WhatsApp Web. Use the hotkey and tray action. | Text is captured through supported path or a clear unsupported-app/no-selected-text message appears. No message is sent by Nahou. | Not run | |
| No selection | Focus each target app with no selected text and use the hotkey. | User sees "This app did not expose selected text" or the equivalent localized message. No raw text appears in the error. | Not run | |
| Large selection | Select text above the desktop capture limit and use the hotkey. | Nahou refuses the selection by default and shows a size warning. No review session is stored for the oversized text. | Not run | |
| Binary clipboard | Put image or other non-text data on the clipboard, then run a normal text capture. | Text capture works when selected text is available. Clipboard restore succeeds when possible or shows a restore warning. | Not run | |
| Arabic UI | Switch interface language to Arabic. Run a capture and review suggestions. | UI is RTL where expected, capture status and privacy copy are localized, and writing mode remains independent of UI language. | Not run | |
| English UI | Switch interface language to English. Run a capture and review suggestions. | UI is LTR, capture status and privacy copy are clear, and writing mode remains independent of UI language. | Not run | |
| Offline mode | Disconnect network and run deterministic capture/review flow without local LLM runtime configured. | Desktop capture and deterministic suggestions still work locally. LLM controls remain unavailable/skipped unless a separate loopback runtime is configured. | Not run | |

## Privacy And Diagnostics Review

- Confirm first-run privacy text says selected text is processed locally, no telemetry is used, the clipboard is used only after hotkey/manual action, and LLM suggestions require separate local runtime configuration.
- Confirm capture diagnostics contain only method, source app name, category flags, and counts/status, not raw selected text.
- Confirm logs captured during QA do not contain selected text.
