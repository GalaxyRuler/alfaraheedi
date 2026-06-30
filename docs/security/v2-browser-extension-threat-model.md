# Nahou V2A Browser Extension Threat Model

Last updated: 2026-06-30

V2A is a browser-first extension lane. The intended data flow is active editor
text -> content script -> extension messaging/background -> local loopback Nahou
API -> extension messaging/background -> content script field UI. There is no
hosted fallback, no telemetry path, and no raw text retention in the V2A
contract.

## Trust Boundaries

| Boundary | Risk | Control |
| --- | --- | --- |
| Web page to content script | The content script may see text from an editor that is unsupported, sensitive, hidden, or structurally complex. | Discover only supported active editors; exclude password, payment, token, API-key, one-time-code, secret, read-only, disabled, hidden, and sensitive-looking fields on a best-effort basis. |
| Content script to extension runtime | Page-origin data or stale editor state could influence messages. | Treat page text as untrusted input; route only through extension messaging; keep API URL and settings in extension-controlled storage. |
| Extension runtime to local API | Editor text could be sent to a non-local endpoint or while the extension is paused. | Persist only loopback API URLs; block analyze calls while paused or site-disabled; no hosted fallback. |
| Local API response to content script | Suggestions may reference stale offsets or mismatched text. | Apply only when editor identity, projection version, and original text still match; stale suggestions remain review-only or are dismissed. |
| Field UI to web page | Suggestion UI may interfere with page focus, accessibility, or text direction. | Keep UI non-destructive until explicit apply; support keyboard dismissal and focus handling; preserve RTL/mixed direction text. |
| Release artifacts and reports | Public artifacts could leak raw editor text, private URLs, screenshots, or account-side store state. | Keep raw text out of logs, reports, docs, screenshots, and source control; use public-safe fixtures and private ignored report roots. |

## Concrete Threats And Controls

### Sensitive Fields

Risk: A page marks a field in a way that looks editable but contains passwords,
payment data, tokens, API keys, one-time codes, or private account content.

Controls:

- exclude browser password fields and known sensitive input types;
- exclude read-only, disabled, hidden, and sensitive-looking fields or ancestor
  containers where metadata allows detection;
- document sensitive-field exclusion as best effort, not a universal guarantee.

### Paused And Site-Disabled States

Risk: Editor text is sent to the local API after the user pauses Nahou or
disables a site.

Controls:

- extension runtime settings gate local API analysis before editor text is sent
  to the loopback API;
- health checks and settings checks contain no editor text;
- release tests prove paused and site-disabled states prevent local API calls
  with editor text.

### Local API Endpoint Control

Risk: A remote endpoint receives editor text through misconfiguration or a page
message.

Controls:

- stored API URLs must be loopback;
- page-origin messages cannot override the API URL;
- errors shown in page UI are sanitized and do not include raw exception
  strings, URLs with private data, or editor text.

### Stale Apply

Risk: A suggestion applies to the wrong span after the user edits the field or
the editor re-renders.

Controls:

- suggestions are anchored to editor identity, projection version, and original
  text;
- apply is blocked when the current text no longer matches;
- real-site claims require manual evidence for rich editors where projection can
  drift.

### Hosted Processing And Telemetry

Risk: Public wording or future code implies hosted processing, analytics, or
operator review.

Controls:

- V2A has no hosted fallback and no telemetry;
- raw editor text is not retained by Nahou after the local request/review flow;
- any future hosted path requires a separate product contract, privacy review,
  and explicit release gate.

## Deferred Threat Areas

Desktop-wide overlays, Office live underlines, bundled model weights, automatic
LLM rewriting, and store approval are outside V2A. They need separate threat
models or amendments before public claims.
