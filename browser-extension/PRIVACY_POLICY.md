# Nahou Browser Extension Privacy Policy

Last updated: 2026-06-25

Nahou is a local-first writing companion for editable web fields. This
policy covers the Nahou browser extension only.

## What The Extension Does

When the extension is enabled and the current site is not disabled, it detects
focused editable text fields on web pages and sends active editable-field text
to the user's configured local Nahou API. The API URL must be a loopback
address such as `http://127.0.0.1` or `http://localhost`. Suggestions are
rendered in the page near the editable field and are applied only when the user
accepts them.

The content script checks the enabled and disabled-site settings before sending
active-field text to the extension runtime. The service worker repeats the same
settings gate before calling the local API.

## Data Accessed

The extension may access text in the active editable field so it can provide
writing suggestions. Supported fields include normal textareas, safe text-like
inputs, compatible contenteditable editors, matching iframe-hosted fields, and
open Shadow DOM text fields.

The extension uses best-effort sensitive-field exclusion and skips:

- password fields;
- read-only or disabled fields;
- sensitive-looking fields such as one-time-code, credit-card, token, API-key,
  and secret fields;
- editable fields inside sensitive-looking ancestor containers;
- non-editable islands inside rich editors;
- hidden decoration nodes and known invisible rich-editor sentinel nodes.

This is a best-effort exclusion based on browser and editor metadata. It is not
a guarantee that every sensitive field on every website or editor is technically
inaccessible.

## Data Sent

The extension sends active-field text only to the configured local loopback
Nahou API. It does not send text to Nahou-hosted services, third
party writing services, analytics providers, or telemetry services.
Health and status checks do not include editor text.

In short: local loopback Nahou API only.

If the user configures the local Nahou API to call a separate local model
runtime, that runtime is outside the browser extension. The extension still
connects only to the configured loopback Nahou API.

## Data Stored

The extension stores only extension settings in browser extension storage:

- local API URL;
- writing mode;
- enabled or paused state;
- disabled-site hostnames chosen by the user.

The content script uses the enabled and disabled-site settings before analysis
messages are sent. The background service worker uses these stored settings for
analysis requests. Content-script messages cannot override the stored API URL
or writing mode.

The extension does not store captured editor text, suggestions, browsing
history, page contents, credentials, or raw API responses.

## Logging And Telemetry

The extension does not use telemetry, hosted analytics, tracking pixels,
beacons, remote logging, or raw editor text logging.

## Remote Code

The extension does not load or execute remote code. It does not use remote
script imports, `eval`, `new Function`, or `importScripts`.

## User Controls

The extension can be paused from the toolbar popup or the options page. When
paused, it does not send active-field text for analysis. The content-side
settings gate blocks analysis before editor text leaves the page context, and
the background service worker repeats the same gate before any local API call.

The extension can also be disabled for the current site from the toolbar popup
and re-enabled for that site later. Disabled-site hostnames can be reviewed or
edited from the options page.

Users can change the local API URL and writing mode from the options page.
Non-loopback API URLs are rejected.

## Data Sharing

Nahou does not sell browser extension data and does not share extension
data with advertisers, analytics providers, hosted writing services, or other
third parties.

Chrome limited-use disclosure: Nahou does not sell extension data, does not use
extension data for telemetry or advertising, processes editor text locally
through the configured loopback Nahou API only, and does not transfer editor
text to Nahou-hosted services.

## Human Review

No Nahou operator or reviewer receives or reads user editor text through
this browser extension. Text stays on the user's machine unless the user
independently configures their local environment to route the local API
elsewhere.

## Changes

If the extension later adds hosted services, telemetry, account sync, or text
retention, this policy must be updated before release and the browser store
privacy disclosures must be updated to match.
