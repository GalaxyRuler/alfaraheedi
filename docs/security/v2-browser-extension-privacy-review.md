# Nahou V2A Browser Extension Privacy Review

Last updated: 2026-06-30

This review covers the browser-first V2A extension contract. It is a source of
truth for planned V2A behavior and must be updated if implementation changes the
data flow.

## Data Flow

The V2A browser extension data flow is:

```text
active editor text -> content script -> extension messaging/background -> local loopback Nahou API
```

Suggestions and status flow back through the same extension path to the content
script field UI. There is no hosted fallback and no telemetry endpoint in V2A.

## Data Processed

- Active editor text from supported browser text fields.
- Deterministic suggestion metadata needed to render and apply a suggestion.
- Extension settings such as enabled or paused state, disabled site list,
  loopback API URL, and writing mode.
- Local API health status and sanitized error categories.

## Data Not Processed Or Stored

Nahou V2A does not intentionally collect browsing history, credentials, account
tokens, passwords, payment data, screenshots, documents outside the active
supported editor, or private site metadata beyond settings needed for
per-site disable.

Nahou V2A does not retain raw editor text, suggestions, raw API request bodies,
raw API responses, or telemetry events by default.

## Retention

Raw editor text is processed in memory for the local request and review flow,
then discarded. Settings are retained until the user changes or removes them.
Manual QA artifacts that could contain raw text must remain in ignored private
report locations or be regenerated with public-safe synthetic text.

## Logs, Reports, And Docs

Raw editor text must stay out of logs, public reports, docs, screenshots,
release notes, issue templates, and source-controlled QA evidence. Public
evidence may include pass/fail status, tested surfaces, package hashes, script
results, sanitized error categories, and public-safe fixture labels.

## User Controls

The extension must provide settings to pause or resume checking and disable the
current site. While paused or site-disabled, editor text must not be sent to the
local API. Health checks and connection status checks must not include editor
text.

## Sensitive-Field Exclusion

Sensitive-field exclusion is best effort. V2A excludes password, payment, token,
API-key, one-time-code, secret, read-only, disabled, hidden, and
sensitive-looking fields when browser and page metadata make that possible.
This does not mean every sensitive field on every website or every rich editor
is technically impossible to access.

## Third Parties

The V2A deterministic path sends text only to the user-controlled local loopback
Nahou API. There is no hosted processing, telemetry, account sync, operator
review, bundled model weights, or automatic LLM rewriting in this contract.

Browser store submission is a separate account-side gate. Store approval or
readiness must not be claimed until public privacy/support pages, screenshots,
store dashboard disclosures, manual QA, and account-side review are complete.
