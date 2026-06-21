# Alfaraheedi v0.5 Universal Writing Companion Execution Plan

## Goal

Ship v0.5 as a Windows desktop writing companion instead of an editor-first product. The primary user flow is: select text in another app, press `Ctrl+Alt+A`, review local suggestions in Alfaraheedi, then copy or replace the selected text while restoring the user's clipboard when possible.

## Non-Goals

- No live Grammarly-style underlines across all apps in v0.5.
- No new Arabic, English, or mixed-language grammar rules in v0.5.
- No bundled model weights.
- No local LLM redesign until v0.6.
- No hosted fallback, telemetry, or raw selected-text logging.

## Phase 0: Base And Branch

- Merge the v0.4.2 local LLM timeout hotfix.
- Create `codex/v0.5-universal-writing-companion` from updated `main`.
- Work only in `C:\CodexProjects\Alfaraheedi`.
- Record this execution plan in `docs/superpowers/plans/2026-06-20-universal-writing-companion.md`.
- Baseline gates:
  - `cargo fmt --all --check`
  - `cargo clippy --workspace -- -D warnings`
  - `cargo test --workspace`
  - `cargo run -p write-eval`
  - `cargo deny check licenses bans sources`
  - `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` in `frontend/`

## Phase 1: Shared Engine Service

- Add `crates/write-service`.
- Put reusable operations behind one Rust boundary:
  - analyze text;
  - apply deterministic safe fixes;
  - list rules;
  - return feedback/report-ready data;
  - return app, version, runtime, and LLM status.
- Keep HTTP API behavior compatible.
- Keep CLI behavior compatible.
- Add service-facing types:
  - `WritingMode`
  - `AnalyzeInput`
  - `ApplySafeInput`
  - `CompanionSession`
- Prove API and desktop/service paths use the same analysis/apply behavior.

## Phase 2: Tauri Companion Shell

- Add `src-tauri/` as the Rust desktop host.
- Use Tauri v2 with global shortcut and clipboard plugins.
- Create a tray app with:
  - show review window;
  - hide review window;
  - check selected text;
  - settings;
  - quit.
- Register default global hotkey `Ctrl+Alt+A`.
- Keep the review window hidden until hotkey or tray action.
- Do not require `writecheck serve` for the desktop app.

## Phase 3: Clipboard Capture And Restore

- Save current clipboard text when available.
- Copy selected text by sending `Ctrl+C`.
- Poll briefly for clipboard text changes.
- Open review window with captured text.
- Restore the previous clipboard text when possible.
- Apply replacement by writing updated text, refocusing the source app, sending `Ctrl+V`, then restoring the clipboard.
- Show clear failures for no selection, clipboard failure, blocked app, large selection, and restore failure.
- Never log raw selected text.

## Phase 4: Review Window UX

- Make the companion review UI the primary Tauri screen.
- Show source app, character count, writing mode selector, suggestions by category, safe fix count, and action buttons.
- Support:
  - Apply Safe Fixes;
  - Copy Corrected Text;
  - Replace Selection;
  - Dismiss;
  - accept/dismiss/report individual suggestions.
- Keep editing to a compact plain-text preview, not a full editor.
- Keep UI language and writing language separate:
  - UI language: Arabic / English;
  - Writing mode: Auto / Arabic / English / Mixed.

## Phase 5: Settings, Privacy, And State

- Store settings under app config, not the repo.
- Persist UI language, default writing mode, hotkey display, clipboard restore behavior, and window preferences.
- Do not retain captured text by default.
- Add first-run privacy copy explaining selected-text capture, local-only processing, no telemetry, clipboard restore, and deferred LLM redesign.
- Keep feedback reports privacy-first and raw-text-free by default.

## Phase 6: Packaging

- Make the recommended Windows artifact a desktop installer:
  - `Alfaraheedi-0.5.0-windows-x64-setup.exe`
- Keep CLI zip as optional developer artifact.
- Stop presenting the old two-exe zip as the main user install.
- Release notes must clearly state:
  - hotkey companion workflow;
  - no live underlines everywhere yet;
  - no bundled model weights;
  - local LLM remains advanced/manual until v0.6.

## Phase 7: Future Integration Roadmap

- v0.6: local LLM setup, selected-text LLM suggestions, progress/cancel, runtime doctor.
- v0.7: browser extension for live web editor underlines.
- v0.8: Word and PowerPoint Office add-ins with document-native ranges.
- v0.9: UI Automation pilot for supported Windows native text controls.
- After those integrations prove useful, reconsider a full cross-app overlay.

## Verification Plan

- Rust gates:
  - `cargo fmt --all --check`
  - `cargo clippy --workspace -- -D warnings`
  - `cargo test --workspace`
  - `cargo run -p write-eval`
  - `cargo deny check licenses bans sources`
- Frontend gates in `frontend/`:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`
  - `npm run build`
- Desktop gates:
  - Tauri crate clippy and tests;
  - Tauri Windows build;
  - manual Notepad, browser textarea, Word, PowerPoint, WhatsApp, no-selection, clipboard-restore, large-selection, Arabic UI, English UI, and offline deterministic-engine checks.
