# Privacy

The default product posture is local-first and no text retention. The CLI, local API server, Docker image, and eval tooling do not require sending user text to a hosted service.

Optional local LLM suggestions are off unless `ALFARAHEEDI_LLM_BASE_URL` is set before the API starts. When enabled, `POST /v1/llm/suggest` sends the submitted text to that local runtime only; Alfaraheedi still does not provide a hosted fallback or retain raw text.

Implementation rules:

- Do not log user text.
- Do not store analyzed text by default.
- Do not silently enable LLM calls without explicit local runtime configuration.
- Keep protected spans out of rule rewrites.
- Treat debug logging of raw text as a privacy bug.
- Add redaction wrappers before any telemetry or hosted mode.

Future hosted mode must document retention, redaction, access controls, and deletion behavior before release.
