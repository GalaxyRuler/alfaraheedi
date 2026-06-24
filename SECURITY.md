# Security

Report security issues privately to the project maintainers. Do not open a public issue for vulnerabilities involving text retention, data exfiltration, arbitrary file access, command execution, or supply-chain compromise.

Security expectations:

- No raw user text in logs.
- No raw selected text in QA reports, screenshots, release artifacts, or public docs.
- No bundled restricted datasets.
- No network calls in the default local checker path.
- Browser extension and Office add-in text processing must stay on loopback local APIs unless a future review explicitly approves another path.
- Local LLM calls require explicit user configuration and consent, and must target a user-controlled loopback runtime.
- No new dependencies without license and maintenance review.
- Release candidates must pass `cargo deny check licenses bans sources`, release-context `npm audit --omit=dev`, staged secret scanning, and public-release hygiene checks.
- Protected spans must suppress rewrite rules for URLs, emails, and code.
- Sensitive-field exclusion is best effort and must be described that way in public claims.

The v1.0 threat model and privacy review are maintained under `docs/security/`.
