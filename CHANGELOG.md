# Changelog

## Unreleased

### Added

- Optional local LLM catalog and policy status surfaces.

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
