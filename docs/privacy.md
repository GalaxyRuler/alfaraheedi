# Privacy

The default product posture is local-first and no text retention. The CLI, local API server, Docker image, and eval tooling do not require sending user text to a hosted service.

Implementation rules:

- Do not log user text.
- Do not store analyzed text by default.
- Keep protected spans out of rule rewrites.
- Treat debug logging of raw text as a privacy bug.
- Add redaction wrappers before any telemetry or hosted mode.

Future hosted mode must document retention, redaction, access controls, and deletion behavior before release.
