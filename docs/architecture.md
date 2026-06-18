# Architecture

## Current Spine

The MVP spine is:

1. `write-core`: shared schema, bidirectional offset maps, protected spans, patch application.
2. `write-arabic`: Arabic-only default rule set with high-precision safe rules and suggest-only punctuation rules.
3. `write-eval`: small seed gate for false positives, protected-span behavior, and explicit failure reporting.
4. `write-api`: Axum JSON API over the same default rule set.
5. `write-cli`: local CLI and server launcher.
6. `write-llm`: optional local LLM model catalog and policy contract.

## Decisions

- Use Rust for the engine, CLI, and API.
- Use byte offsets internally, but expose UTF-16 and grapheme mappings because DOM, CodeMirror, WXT, and LSP clients commonly speak UTF-16.
- Treat bidi/shaping as display concerns, not checking-core concerns. Logical text checking should not depend on HarfBuzz or bidi display logic.
- Use a thin TypeScript shell with CodeMirror 6 for future editor work. Leptos is deferred because rich-text selection, IME, RTL caret handling, and decoration overlays are mature in JS editor stacks.
- Defer English/Harper until the Arabic apply/eval spine round-trips safely.
- Defer spelling until dictionary licensing and engine choice are resolved. `zspell` is Apache-2.0 but stale; compare it against Helix `spellbook` and a Hunspell fallback before adopting.
- Use `lingua-rs` rather than `whatlang` for future short/mixed text language routing.
- Use `tower-lsp-community/tower-lsp-server` if LSP is added later.
- Keep the LLM path local, explicit, and suggestion-only. LLM output must not feed safe auto-apply without a separate measured eval gate.
- Use a local OpenAI-compatible llama.cpp-style runtime boundary for GGUF models rather than linking native inference into the core engine.

## Arabic MVP Scope

MVP Arabic rules must be high precision. Context-free hamza, final ya/alef-maqsura, and taa-marbuta/haa fixes are deferred because they need morphology and can be correct in multiple forms.

Current safe auto-apply rules:

- Tatweel removal.
- Repeated-space collapse in Arabic context.

Current suggest-only rules:

- Latin comma in Arabic context.
- Latin question mark in Arabic context.
- Space before Arabic punctuation.

Potential additions after the current spine:

- Arabic-Indic and ASCII digit normalization as explicit suggestions.
- NFC composed/decomposed checks with reversible normalization maps.
- Dictionary spelling as suggest-only, never auto-apply.

## Optional Local LLM Scope

The local LLM layer is a second-pass assistant for explanations, alternatives, and style-sensitive suggestions. It is not part of the high-precision rule engine and does not decide safe patches.

Current policy:

- Default candidate: `qwen3-1.7b-q4_k_m`.
- Low-memory candidate: `qwen3-0.6b-q4_0`.
- Quality-tier candidate: `qwen3-4b-q4_k_m`.
- Runtime boundary: local OpenAI-compatible server, such as llama.cpp serving a manually installed GGUF file.
- No bundled model weights.
- No hosted fallback by default.
- No raw text logging.
- No LLM safe auto-apply.
