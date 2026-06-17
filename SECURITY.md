# Security

Report security issues privately to the project maintainers. Do not open a public issue for vulnerabilities involving text retention, data exfiltration, arbitrary file access, command execution, or supply-chain compromise.

Security expectations:

- No raw user text in logs.
- No bundled restricted datasets.
- No network calls in the default local checker path.
- No new dependencies without license and maintenance review.
- Protected spans must suppress rewrite rules for URLs, emails, and code.
