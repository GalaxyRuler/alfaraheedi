# Nahou V2A Acceptance Matrix

This matrix tracks the browser-first V2A claim gates. Detailed logs,
screenshots, and live-site QA notes must stay private or ignored unless they are
reduced to public-safe, no-raw-text evidence.

## Browser-First Contract Gates

| Gate | Expected behavior | Evidence required | Release blocker |
| --- | --- | --- | --- |
| textarea/input inline suggestions | Supported textarea fields and text-like inputs show local-first suggestions directly in the field, with deterministic suggestions from the loopback API. | Focused automated fixture tests and browser package validation. | Yes |
| simple contenteditable suggestions | Simple `contenteditable` editors show suggestions only when text projection to DOM ranges is stable. | Projection tests plus controlled browser QA. | Yes |
| stale apply/suggestion handling | Accepted suggestions apply only when the original text still matches; stale or unanchored suggestions cannot apply unsafely. | Anchored apply tests covering editor identity, projection version, and original text match. | Yes |
| sensitive-field exclusion | Password, payment, token, API-key, one-time-code, secret, read-only, disabled, hidden, and similar fields are excluded on a best-effort basis. | Discovery tests and manual review of representative fields. | Yes |
| paused/site-disabled | Paused extension state and per-site disable prevent editor text from being sent to the local API. | Settings tests proving no analyze message or API call with editor text. | Yes |
| local API unavailable | API outage or connection failure shows sanitized user-facing status, with no hosted fallback and no raw exception or editor text reflection. | Local connection UX tests and manual browser QA. | Yes |
| IME/composition | Browser IME/composition input is not analyzed until composition ends, so partial composing text is not sent. | Composition tests and browser QA. | Yes |
| RTL/mixed text | Arabic and mixed-direction text keep correct offset mapping, direction-aware UI, and guarded apply behavior. | RTL/mixed fixtures and visual/keyboard review. | Yes |
| real-site/manual-gated | Gmail, WhatsApp Web, Google Docs, and other production editors require disposable public-safe manual evidence before any site-specific claim. | Completed manual report with private raw text excluded. | Yes for site-specific claims |
| accessibility/keyboard review | Suggestion UI supports keyboard focus, dismissal, visible focus, direction-aware labels, and assistive-technology review gates. | Keyboard smoke, accessibility smoke, and manual screen-reader review before public claim. | Yes |
| release/store gates | Local-ready package, public privacy/support pages, store dashboard state, screenshots, and account-side review gates match the claim. | Release readiness scripts plus account-side manual confirmation. | Yes before store readiness |

## Deferred Evidence Rows

| Surface | V2 status | Required proof before claim |
| --- | --- | --- |
| V2B desktop overlay | Deferred after V2A release-candidate stability. | Windows UI Automation range geometry, overlay positioning, safe hide behavior, and guarded apply proof per app. |
| Office live underlines | Deferred unless separately rescoped. | Dedicated Word and PowerPoint Office.js proof, sideload QA, accessibility review, and AppSource/account gates. |
| Hosted or account processing | Out of scope for V2A. | A separate privacy, security, and product contract would be required before any hosted path exists. |
