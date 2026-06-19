# Changelog

## Unreleased

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
