# Architecture

## Current Spine

The MVP spine is:

1. `write-core`: shared schema, bidirectional offset maps, protected spans, patch application.
2. `write-arabic`: Arabic-only default rule set with high-precision safe rules and suggest-only punctuation rules.
3. `write-eval`: small seed gate for false positives, protected-span behavior, and explicit failure reporting.
4. `write-service`: shared Rust service boundary used by the API, CLI-facing flows, and desktop companion.
5. `write-api`: Axum JSON API over the same service boundary.
6. `write-cli`: local CLI and server launcher.
7. `write-llm`: optional local LLM model catalog and policy contract.
8. `frontend`: TypeScript/React/Vite UI used by both the local web workbench and the Tauri review window.
9. `src-tauri`: packaged Windows desktop companion host for tray, global hotkey, clipboard capture/apply, settings, and privacy-preserving app state.

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
- Use CodeMirror 6 in the web app for the writing surface because RTL editing, selection, and decorations are editor concerns, not string-textarea concerns.
- Allow CORS for loopback origins only so local Vite development can call the API without enabling hosted or arbitrary website access.
- Use Tauri for the packaged desktop companion. The OS WebView is only the app window; the normal user path must not require a browser tab or a localhost URL.
- Use a hotkey-plus-clipboard workflow for v0.5 universal app support. Windows does not expose one reliable universal text read/decorate/replace API across Word, PowerPoint, browsers, chat apps, and native controls.
- In v0.9, try Windows UI Automation TextPattern capture before clipboard capture for supported focused native text controls. This is a best-effort capture pilot only; replacement still uses clipboard paste fallback.
- Treat raw selected text as session-only state in the desktop companion. It must not be logged, retained by default, or included in feedback reports unless the user explicitly supplies a reduced public example.

## v1.0 Product Boundary

The v1.0 product path is the packaged Windows desktop companion. A normal user
installs Nahou, selects text in another app, presses the configured hotkey,
reviews local deterministic suggestions, and then replaces the selection or
copies corrected text.

The supported v1.0 surface targets are Notepad, browser textarea/input fields,
WhatsApp Web text boxes, Word selected text, and PowerPoint selected text.
Support is limited by target application APIs, UI Automation provider behavior,
and guarded replacement checks.

Browser extension and Office add-in packages share the same local engine and
privacy boundary, but they are optional integrations with separate manual QA,
store documentation, and external review gates. Local LLM suggestions remain a
manual second-pass option behind explicit local runtime configuration and are
not part of deterministic safe auto-apply.

Non-goals for v1.0 are universal live desktop overlays, hosted text processing,
telemetry, bundled model weights, complete Arabic morphology, full English
grammar, and UI Automation replacement before a separate real-app pilot proves
it safe.

## v0.5 Companion Scope

The v0.5 desktop companion is the primary product surface for cross-app writing help:

- User selects text in another app.
- User presses `Ctrl+Alt+A` or uses the tray action.
- Rust saves clipboard text when possible, sends `Ctrl+C`, captures selected text, restores the clipboard, and opens the review window.
- The review window analyzes text locally through `write-service`.
- The user can apply deterministic safe fixes, accept individual suggestions, copy corrected text, or replace the original selection.
- Replacement writes the corrected text to the clipboard, refocuses the source app when possible, sends `Ctrl+V`, and restores the previous clipboard text when possible.

Live underlines in browsers, Office-native document ranges, and UI Automation overlays are intentionally later integration milestones.

## v0.9 UI Automation Pilot

The v0.9 desktop companion adds a Windows-only UI Automation probe in
`src-tauri/src/uia_pilot.rs`.

Scope:

- Use the currently focused Windows control, not a background text monitor.
- Read selected text through UI Automation TextPattern when the control exposes
  it.
- Fall back to the existing clipboard-mediated capture path when UIA is not
  available, unsupported, empty, or blocked.
- Expose the capture method to the review UI so QA can tell whether a session
  used UIA or clipboard capture.
- Keep replacement on the proven clipboard paste path.

Non-goals:

- No always-on UIA polling.
- No cross-app underline overlay.
- No raw selected text in logs or reports.
- No UIA replacement or document-range mutation until capture reliability is
  proven on real apps.

## Arabic MVP Scope

MVP Arabic rules must be high precision. Context-free hamza, final ya/alef-maqsura, and taa-marbuta/haa fixes are deferred because they need morphology and can be correct in multiple forms.

Current safe auto-apply rules:

- Tatweel removal.
- Repeated-space collapse in Arabic context.

Current suggest-only rules:

- Latin comma in Arabic context.
- Latin question mark in Arabic context.
- Latin semicolon in Arabic context.
- Space before Arabic punctuation.
- Space after Arabic punctuation.
- Narrow conversational greeting rewrite for `كيف حال ما اخبار`-style text.

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

In the desktop companion, v0.6 stores optional local LLM runtime settings in the app config directory and calls `write-service` directly from the Tauri host. The normal packaged-app path still does not require a browser tab, a visible localhost URL, or a separate `writecheck serve` process. Runtime URLs are loopback-only, and LLM output can update the review preview only through an explicit manual action.
