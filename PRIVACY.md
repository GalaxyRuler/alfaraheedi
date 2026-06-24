# Privacy Policy

Nahou is a local-first writing companion. The default desktop app, CLI, local API,
browser extension bridge, and Office add-ins process selected or active-field text
on the user's machine and do not send it to Nahou-hosted services.

Nahou does not provide telemetry, hosted analytics, account sync, hosted writing
review, or remote operator review in v1.0. Raw selected text must not be written
to logs, reports, screenshots, public artifacts, or release evidence.

## Data Processed

Depending on the surface used, Nahou may process:

- text selected by the user in the desktop companion flow;
- clipboard contents during capture and restore;
- text exposed by supported Windows UI Automation providers;
- active editable-field text in the browser extension;
- selected Word or PowerPoint text in the Office add-ins;
- local runtime configuration, writing mode, enabled or paused state, and
  disabled-site preferences.

The browser extension and Office add-ins use best-effort sensitive-field
exclusion. They avoid password, payment, token, one-time-code, API-key,
read-only, disabled, hidden, and sensitive-looking editor fields where the host
surface exposes enough information to identify them. This is a best-effort
exclusion, not a guarantee that every sensitive field on every website or Office
surface is technically inaccessible.

## Data Stored

Nahou stores settings needed to run the product, such as local API URL, writing
mode, enabled or paused state, and disabled sites. Nahou does not store captured
selected text, editor contents, suggestions, source documents, browsing history,
credentials, raw API responses, or screenshots by default.

Detailed QA logs and screenshots, when manually created during release testing,
must remain private and must not include raw selected text.

## Local LLM Runtime

Optional local LLM suggestions are off until the user configures a loopback local
runtime and explicitly consents. When enabled, the selected text is sent to the
configured local runtime at `127.0.0.1` or `localhost`. Nahou does not provide a
hosted fallback. Users should not enable this feature unless the configured local
runtime is controlled by them.

## Future Hosted Mode

The project currently has no hosted text-processing service. If hosted mode,
telemetry, account sync, or retention is added later, the project must define
retention, redaction, access controls, deletion, audit behavior, and public
privacy disclosures before launch.
