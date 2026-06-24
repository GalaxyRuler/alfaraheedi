# Nahou Privacy

Last updated: 2026-06-25

Nahou is a local-first writing companion. The desktop app, browser extension,
Office add-ins, CLI, and local API are designed to process writing on your own
machine. Nahou v1.0 does not provide a hosted writing service, hosted telemetry,
hosted analytics, account sync, or remote human review.

## What Nahou Processes

Depending on what you use, Nahou may process text you select in another app,
active editable-field text in the browser extension, selected Word or PowerPoint
text in Office add-ins, clipboard text during capture and restore, and local
settings such as writing mode or local API URL.

## What Nahou Stores

Nahou stores settings needed to run the product. Nahou does not store captured
selected text, source documents, browser page contents, suggestions, browsing
history, credentials, raw API responses, screenshots, or telemetry by default.

## Local API And Local LLM Runtime

Browser and Office integrations send text only to the configured local Nahou API
on your machine. If you enable optional local LLM suggestions, Nahou sends the
selected text to the loopback local model runtime you configured. Do not enable
local LLM suggestions unless that runtime is controlled by you.

## Sensitive Fields

Nahou uses best-effort sensitive-field exclusion in browser and Office
integrations. It avoids password, payment, token, one-time-code, API-key,
read-only, disabled, hidden, and sensitive-looking fields where the host surface
exposes enough information to identify them. This is a best-effort exclusion,
not a guarantee that every sensitive field in every app, website, editor, or
document is technically inaccessible.

## Sharing

Nahou does not sell user data. Nahou does not share text with advertisers,
analytics providers, hosted writing services, or other third parties in v1.0.

If Nahou later adds hosted services, telemetry, account sync, or text retention,
this privacy page and store disclosures must be updated before that release.
