# Nahou V2A Product Contract

Last updated: 2026-06-30

V2A is the browser-first development lane for Grammarly-like in-text assistance.
It does not replace the v1.0 desktop selected-text product contract until the
V2A release gates pass and a release note explicitly says so.

## Public Claim

The V2A target public claim is:

> Nahou checks supported browser text fields as you type, shows local-first suggestions directly in the field, and applies accepted deterministic suggestions in place when the original text still matches.

Until the acceptance matrix and release gates pass, this is a planned V2A claim,
not a shipped public release claim.

## Supported V2A Path

1. The user runs the local Nahou API on loopback.
2. The browser extension detects a supported active editor.
3. Active editor text flows from active editor text -> content-side settings
   gate -> extension messaging/background -> background settings gate -> local
   loopback Nahou API.
4. The local deterministic engine returns suggestions.
5. The content script renders local-first field UI for supported text fields.
6. Accepted deterministic suggestions apply in place only when the editor
   identity, projection version, and original text still match.

The content-side settings gate runs before editor text leaves the page context.
The background settings gate repeats the pause and site-disable checks before
calling the local loopback Nahou API.

## Release-Blocking V2A Surface

| Surface | V2A support statement |
| --- | --- |
| Textarea and text-like input fields | Inline suggestions, local loopback analysis, field UI, and guarded deterministic apply for supported text-like fields. |
| Simple contenteditable fields | Suggestions and guarded apply only where text projection to DOM ranges is stable. |
| Stale or changed editor text | Apply is blocked when the original text no longer matches. |
| Paused or site-disabled extension | Editor text is not sent from the content script to extension runtime or from background to the local API while paused or disabled for the current site. |
| Sensitive-looking fields | Password, payment, token, one-time-code, API-key, secret, read-only, disabled, hidden, and similar fields are excluded on a best-effort basis. |
| Local API unavailable | The user sees sanitized unavailable status; no hosted fallback is used. |
| IME/composition and RTL/mixed text | Analysis waits for composition to finish, and UI must preserve directionality for Arabic and mixed text. |
| Real-site claims | Gmail, WhatsApp Web, Google Docs, and similar production editors require manual gated evidence before any public site-specific claim. |

## Deferred Tracks

V2B is a later evidence-driven desktop overlay track. It starts from browser V2A
results and separate Windows UI Automation proof, not from a public V2A claim.

Office inline behavior is separately gated and deferred unless a future plan
explicitly rescope Office into a dedicated release lane. Word proof is not
PowerPoint proof, and Office sideload or AppSource readiness needs its own
manual evidence.

## Explicit Non-Claims

- No full Arabic grammar checking, full grammar checking, or grammar-perfection
  guarantee.
- No universal support for every website or every rich editor.
- No desktop-wide live overlay support or desktop-wide live overlays.
- No Office live underlines.
- No hosted processing.
- No bundled model weights or automatic LLM rewriting.
- No store approval or readiness before account-side gates.
- No raw editor text in logs, public reports, screenshots, release notes, or
  source-controlled QA evidence.

## Release Evidence

The source of truth for V2A acceptance is
`docs/testing/v2-acceptance-matrix.md`. Privacy and security evidence must match
`docs/security/v2-browser-extension-threat-model.md` and
`docs/security/v2-browser-extension-privacy-review.md`.
