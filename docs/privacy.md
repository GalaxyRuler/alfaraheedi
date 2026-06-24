# Privacy

The default product posture is local-first and no text retention. The desktop
app, CLI, local API server, Docker image, browser extension bridge, Office
add-ins, and eval tooling do not require sending user text to a hosted service.

Optional local LLM suggestions are off unless the user configures a loopback
local runtime. When enabled, `POST /v1/llm/suggest` sends the submitted text to
that local runtime only; Nahou still does not provide a hosted fallback or
retain raw text.

Browser and Office integrations use best-effort sensitive-field exclusion for
password, payment, token, API-key, one-time-code, hidden, disabled, read-only,
and sensitive-looking fields where the host surface exposes enough metadata to
identify them. This reduces accidental capture risk but is not a universal
technical guarantee across every website, editor, or Office document state.

Implementation rules:

- Do not log user text.
- Do not store analyzed text by default.
- Do not silently enable LLM calls without explicit local runtime configuration.
- Do not claim sensitive fields are impossible to access; claim best-effort
  exclusion.
- Keep protected spans out of rule rewrites.
- Treat debug logging of raw text as a privacy bug.
- Keep detailed QA reports, screenshots, and temporary logs private and ignored.
- Add redaction wrappers before any telemetry or hosted mode.

Future hosted mode must document retention, redaction, access controls, and deletion behavior before release.
