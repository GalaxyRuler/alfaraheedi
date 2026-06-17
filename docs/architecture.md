# Architecture

## Current Spine

The MVP spine is:

1. `write-core`: shared schema, bidirectional offset maps, protected spans, patch application.
2. `write-arabic`: Arabic-only default rule set with high-precision safe rules.
3. `write-eval`: tiny seed gate for false positives and precision.
4. `write-api`: Axum JSON API over the same default rule set.
5. `write-cli`: local CLI and server launcher.

## Decisions

- Use Rust for the engine, CLI, and API.
- Use byte offsets internally, but expose UTF-16 and grapheme mappings because DOM, CodeMirror, WXT, and LSP clients commonly speak UTF-16.
- Treat bidi/shaping as display concerns, not checking-core concerns. Logical text checking should not depend on HarfBuzz or bidi display logic.
- Use a thin TypeScript shell with CodeMirror 6 for future editor work. Leptos is deferred because rich-text selection, IME, RTL caret handling, and decoration overlays are mature in JS editor stacks.
- Defer English/Harper until the Arabic apply/eval spine round-trips safely.
- Defer spelling until dictionary licensing and engine choice are resolved. `zspell` is Apache-2.0 but stale; compare it against Helix `spellbook` and a Hunspell fallback before adopting.
- Use `lingua-rs` rather than `whatlang` for future short/mixed text language routing.
- Use `tower-lsp-community/tower-lsp-server` if LSP is added later.

## Arabic MVP Scope

MVP Arabic rules must be high precision. Context-free hamza, final ya/alef-maqsura, and taa-marbuta/haa fixes are deferred because they need morphology and can be correct in multiple forms.

Safe MVP additions after the current spine:

- Arabic-Indic and ASCII digit normalization as explicit suggestions.
- Space-before-punctuation checks.
- NFC composed/decomposed checks with reversible normalization maps.
- Dictionary spelling as suggest-only, never auto-apply.
