# Changelog

## Unreleased

No unreleased changes.

## v2.0.0-rc.1 - 2026-06-30

### Added

- Promoted the V2A browser-first extension lane to a local-ready release
  candidate for supported browser text fields.
- Added in-field suggestions, non-mutating underline/highlight marks, keyboard
  suggestion-card flow, stale-apply guards, contenteditable DOM-range apply,
  iframe and open Shadow DOM coverage, pause/site-disable enforcement, and
  public-safe V2 validation evidence.
- Added store-prep reviewer evidence for the V2A local-ready browser claim while
  keeping live Gmail, WhatsApp Web, Google Docs, manual screen-reader, and
  account-side store submission gates separate.

### Safety

- V2A remains local-first: active editor text is gated before leaving the page
  context, gated again before the loopback API call, and never sent to a hosted
  writing service or telemetry endpoint.
- Public reports, release notes, screenshots, and store-prep evidence must not
  include raw live editor text.

### Known Limitations

- The V2A release candidate does not claim every website, every rich editor,
  production Gmail/WhatsApp/Google Docs compatibility, desktop-wide live
  overlays, Office live underlines, hosted processing, bundled model weights, or
  browser-store approval.
- Store readiness remains false until account-side live-editor QA, manual
  screen-reader review, and Chrome Web Store / Edge Add-ons submission gates are
  completed.

## v1.0.0-rc.1 - 2026-06-25

### Added

- Added the Windows desktop companion as the primary v1.0 product path:
  install Nahou, select text in a supported app, press `Ctrl+Alt+A`,
  review local suggestions, then copy corrected text or replace the selection.
- Added the Chrome/Chromium browser-extension foundation for editable web
  fields with loopback-only API settings, accessible suggestion-panel focus
  handling, `dir="auto"` mixed Arabic/English text, viewport clamping,
  Escape dismissal, forced-colors fallbacks, and guarded individual apply.
- Added the Word and PowerPoint Office add-ins foundation for selected-text
  task-pane checks through Office.js and the local Nahou API.
- Added UIA-first desktop capture diagnostics and fallback notices while
  keeping replacement on the clipboard-paste path for v1.0.
- Added desktop companion local LLM setup fields for loopback runtime URL,
  model id, timeout, runtime status checking, runtime doctor checks, selected
  text suggestion requests, progress, and cancellation controls.

### Safety

- Nahou remains local-first for v1.0: no hosted processing, telemetry, or
  bundled model weights are required for the desktop path.
- Desktop local LLM runtime URLs are validated as loopback-only, and LLM output
  remains suggestion-only with manual apply only.
- Browser extension and Office add-in release gates keep API endpoints local and
  keep raw captured text out of source-controlled QA reports by default.

### Known Limitations

- UIA capture and desktop replacement support are app/control dependent; v1.0
  supports the documented surfaces and falls back to clipboard-based behavior
  where required.
- Browser extension and Office add-ins are optional v1.0 integrations with
  their own sideload/store-readiness gates; the Windows desktop installer is
  the primary user path.
- Nahou does not claim broad Arabic morphology, broad English grammar checking,
  live desktop underlines, hosted model fallback, or bundled local model
  weights.

## v0.5.0 - 2026-06-21

### Added

- Added the Windows desktop companion as the primary v0.5 surface: select text in another app, press `Ctrl+Alt+A`, review suggestions locally, then copy corrected text or replace the original selection.
- Added a shared `write-service` crate so the CLI, API, and desktop companion use the same analysis and safe-apply behavior.
- Added narrow deterministic English suggestions for common typos and `you are do`-style question grammar.
- Added a narrow Arabic conversational greeting suggestion for `كيف حال ما اخبار`-style text.

### Changed

- Made the recommended Windows user artifact a desktop installer: `Nahou-0.5.0-windows-x64-setup.exe`.
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
