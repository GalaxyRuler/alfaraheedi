# Changelog

## Unreleased

### Added

- Added a v0.8 Office add-ins foundation for Word and PowerPoint selected-text
  task-pane integration.
- Added a v0.7 Chrome Manifest V3 browser-extension foundation for editable web fields, including scroll- and layout-synchronized non-mutating wavy underline overlays for safe text-like inputs (`text`, `search`, `email`, `url`, and `tel`) and textarea fields while excluding password, sensitive-hinted fields, and sensitive-hinted ancestor containers, CSS Highlight marks for contenteditable fields, broader contenteditable token discovery, read-only/disabled and ARIA read-only/disabled text-control skipping, iframe-hosted editor injection, open Shadow DOM text-control event handling, loopback API URL and writing-mode extension settings, a toolbar popup for quick settings/status access with a loopback API health check and pause/resume control, keyboard-accessible suggestion panel focus handling with unique replacement-specific Apply labels, bidirectional `dir="auto"` panel/source/replacement text, AA contrast and Windows forced-colors fallbacks for extension UI, and Escape dismissal, non-actionable stale/unanchored suggestion display, IME/composition-safe debounce, local oversized-text refusal before runtime/API sends, sanitized runtime/API error messages, stale-response protection while users keep typing, stale Apply status when a rendered suggestion no longer matches current text, contenteditable line-break and blank-block newline/offset handling, non-editable, hidden, and production sentinel rich-editor island skipping, span-anchored plain-field replacement for repeated text with untrimmed analyze requests, composed replacement `InputEvent` dispatch for applied fixes, manifest-declared PNG extension icons, clean extension zip packaging, store-preflight manifest/privacy guardrails, and guarded individual suggestion apply/edit/focus/removal cleanup that clears injected review UI while preserving simple inline contenteditable markup.
- Added a source-controlled browser-extension manual release gate and private report generator for live production-editor checks, manual screen-reader review, public privacy URL readiness, and store-dashboard review before public store submission.
- Added desktop companion local LLM setup fields for loopback runtime URL, model id, and timeout.
- Added desktop companion runtime status checking without requiring `writecheck serve`.
- Added desktop companion runtime doctor checks for policy, configuration, `/v1/models`, and suggestion-only probing.
- Added selected-text local LLM suggestions in the companion review window, with manual apply only.
- Added progress and cancellation controls for in-flight desktop companion local LLM suggestions.

### Safety

- Desktop local LLM runtime URLs are validated as loopback-only.
- LLM output remains suggestion-only and is not eligible for deterministic safe auto-apply.

## v0.5.0 - 2026-06-21

### Added

- Added the Windows desktop companion as the primary v0.5 surface: select text in another app, press `Ctrl+Alt+A`, review suggestions locally, then copy corrected text or replace the original selection.
- Added a shared `write-service` crate so the CLI, API, and desktop companion use the same analysis and safe-apply behavior.
- Added narrow deterministic English suggestions for common typos and `you are do`-style question grammar.
- Added a narrow Arabic conversational greeting suggestion for `كيف حال ما اخبار`-style text.

### Changed

- Made the recommended Windows user artifact a desktop installer: `Alfaraheedi-0.5.0-windows-x64-setup.exe`.
- Kept the CLI/web zip as an optional developer artifact instead of the main user install path.

### Fixed

- The desktop app now launches as a visible GUI app instead of an empty console window.
- Hotkey capture waits for `Ctrl+Alt+A` release before copying selected text, improving selection capture in external apps.

### Safety

- The desktop companion remains local-first, opt-in through an explicit hotkey, and does not bundle model weights or require a hosted service.

## v0.4.1 - 2026-06-20

### Fixed

- Packaged web builds now use the current app origin for the local API instead of hardcoding `http://127.0.0.1:3000`.
- Existing browser settings saved from `v0.4.0` migrate the old default API URL to the packaged app origin.
- Added a visible header language switch and changed product copy from Arabic-only wording to local writing checker wording.

## v0.4.0 - 2026-06-20

### Added

- Privacy-first workbench feedback reports with raw text omitted by default.
- Reported feedback eval fixture metadata and validation.
- CLI local LLM doctor for CPU-only runtime configuration and suggestion-only contract checks.
- Public feedback triage and patch-release policy for privacy-safe post-release reports.

### Changed

- Updated GitHub Actions to current Node runtime-compatible action versions.

## v0.3.0 - 2026-06-19

### Added

- Playwright E2E tests for the packaged web workbench in desktop and mobile Chromium.
- Optional LLM smoke script with skip, mock-runtime, and configured-runtime modes.
- Eval recall tracking with false-negative failures for missing expected rules.
- Arabic semicolon and missing-space-after-punctuation suggestion rules.
- Public README badges and workbench screenshot.

### Changed

- CI now runs the packaged-app Playwright E2E lane.
- Evaluation docs now describe precision and recall gates.

## v0.2.0 - 2026-06-19

### Added

- Optional local LLM catalog and policy status surfaces.
- Local React/Vite writing workbench with editor, suggestions, rule catalog, settings, and local LLM status panels.
- Opt-in local OpenAI-compatible LLM suggestions through `POST /v1/llm/suggest` and `writecheck llm suggest`.
- Static frontend serving through `writecheck serve --frontend-dir`.
- One-command local development script: `scripts/dev.ps1`.
- Local llama.cpp helper script: `scripts/llm-serve.ps1`.
- Windows x64 release package script: `scripts/package-windows.ps1`.
- GitHub Actions frontend CI and tag-driven Windows release asset workflow.
- Manual-apply local LLM suggestion card in the web workbench.

### Changed

- Bumped workspace and frontend package versions to `0.2.0`.
- Refined the web workbench palette, focus states, touch targets, and keyboard skip link.
- Expanded the release checklist with frontend, package, and release-asset gates.

### Safety

- LLM output remains suggestion-only and is never eligible for `fix --safe`.
- No model weights are bundled, downloaded, or redistributed by default.
- Hosted fallback remains disabled by default.

## v0.1.0 - 2026-06-18

### Verification

Release candidate `v0.1.0-rc.1` passed fresh-clone verification on Windows.

### Added

- Rust-native core engine.
- Byte, UTF-16, and grapheme offset tracking.
- Reverse UTF-16 and grapheme range mapping.
- Protected spans for URLs, emails, and inline code.
- Arabic tatweel safe fix.
- Arabic repeated-space safe fix.
- Arabic punctuation suggestions.
- Arabic space-before-punctuation suggestion.
- Safe patch application.
- CLI check and safe fix commands.
- Axum JSON API.
- Docker runtime.
- Seed eval gate with rule-level metrics and explicit failure details.
- CLI, API, and Docker smoke scripts.
- Privacy, security, contribution, and data policy docs.

### Not Included

- Full Arabic grammar correction.
- Arabic morphology.
- Spell checking.
- English grammar checking.
- Browser extension.
- Hosted service.
