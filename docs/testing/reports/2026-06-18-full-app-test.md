# Full App Test Report - 2026-06-18

## Scope

Tested `v0.1.0` on branch `codex/public-oss-mvp` at commit `f5df7b6`.

Surfaces tested:

- Rust workspace static and test gates.
- CLI release binary.
- Local Axum API release binary.
- Docker image and container runtime.
- Release eval suite.
- Supply-chain policy with `cargo-deny`.
- Source hygiene and production-code safety scans.
- Fresh clone from local `v0.1.0` tag.

## Environment

- Workspace: canonical local checkout, path omitted from public report.
- OS shell: Windows PowerShell
- Docker: available through Docker Desktop
- Missing optional tools: `cargo-audit`, `k6`, OWASP ZAP, Schemathesis

## Commands And Results

| Area | Command or scenario | Result |
| --- | --- | --- |
| Format | `cargo fmt --all --check` | Pass |
| Lint | `cargo clippy --workspace -- -D warnings` | Pass |
| Tests | `cargo test --workspace` | Pass |
| Release build | `cargo build --release -p write-cli -p write-api` | Pass |
| Eval | `cargo run -p write-eval` | Pass: 15 cases, 10 true positives, 0 false positives, 0 failures |
| Cargo deny | `cargo deny check licenses bans sources` | Pass |
| Cargo deny full | `cargo deny check` | Pass: advisories, bans, licenses, sources |
| Smoke scripts | `.\scripts\smoke-cli.ps1; .\scripts\smoke-api.ps1; .\scripts\smoke-docker.ps1` | Pass |
| Fresh clone | clone `v0.1.0`, run fmt, clippy, tests, eval, deny, all smokes | Pass |

## CLI Manual Testing

Release binary: `target\release\writecheck.exe`

| Scenario | Result |
| --- | --- |
| `--help` exposes `check`, `fix`, and `serve` | Pass |
| `check --format json` on `مرحبــا  بالعالم` | Pass: `arabic:tatweel`, `arabic:repeated-space` |
| `check` text output mentions rule sources | Pass |
| `fix --safe` stdout | Pass: exact `مرحبا بالعالم` |
| `fix --safe --output` | Pass: output file exact and input unchanged |
| `fix --safe --format json` | Pass: text fixed, `applied_count = 2`, no remaining suggestions |
| Protected URL, inline code, and email input | Pass: zero suggestions |
| Suggest-only punctuation input | Pass: rules reported as `safe_auto_apply = false`; safe fix keeps text unchanged |
| English-only input | Pass: zero suggestions |
| Missing file | Pass: non-zero with file read error |
| `fix` without `--safe` | Pass: non-zero with `MVP only supports --safe fixes` |
| stdin check | Pass: detects `arabic:tatweel` |

## API Manual Testing

Release binary: `target\release\write-api.exe`

| Endpoint or scenario | Result |
| --- | --- |
| `GET /healthz` | Pass: `status = ok`, `service = write-api` |
| `GET /v1/health` | Pass |
| `GET /v1/rules` | Pass: 5 rules returned |
| `POST /v1/analyze` on `مرحبــا  بالعالم` | Pass: 2 suggestions |
| `POST /v1/apply` with `mode = safe` | Pass: fixed text, 2 applied, 0 skipped |
| Protected URL, inline code, and email input | Pass: zero suggestions |
| Empty input | Pass: lengths 0/0/0 and zero suggestions |
| `GET /v1/analyze` | Pass: 405 |
| Unknown route | Pass: 404 |
| Bad apply mode | Pass: 422 |
| Missing `text` | Pass: 422 |
| Malformed JSON | Pass: 400 |

## Docker Manual Testing

Built `alfaraheedi:test-full` and ran `alfaraheedi-full-test` on host port `3199`.

| Scenario | Result |
| --- | --- |
| Image build | Pass |
| Container starts and serves `/healthz` | Pass |
| `GET /v1/rules` | Pass: 5 rules |
| `POST /v1/analyze` | Pass: `arabic:tatweel`, `arabic:repeated-space` |
| `POST /v1/apply` | Pass: fixed text and 2 applied |
| Wrong method on `/v1/apply` | Pass: 405 |
| Container cleanup | Pass: no leftover `alfaraheedi*` containers |

## Light Performance Check

Ran 100 local API requests against the release binary, alternating `/v1/analyze` and `/v1/apply`.

- Requests: 100
- Errors: 0
- Elapsed: 121.1 ms
- Average: 1.21 ms/request

This is a smoke performance check, not a formal load test.

## Hygiene And Security-Oriented Checks

| Check | Result |
| --- | --- |
| Secret/local path scan | No leaked secrets or local paths. Hits were limited to safe policy text in `CONTRIBUTING.md` and ignore rules in `.gitignore` / `.dockerignore`. |
| Ignored artifact scan | Only `docs/plans/`, `docs/superpowers/`, and `target/` ignored. |
| Production `unsafe` scan | No production `unsafe` hits. |
| Production panic/todo/dbg/mutex scan | No production hits. `expect` appears only in tests. |
| Docker leftovers | None. |

## Findings

No S0, S1, or S2 defects found in this pass.

### S3-1: No machine-readable API contract

The API has integration tests and manual endpoint checks, but no OpenAPI or JSON Schema contract. Spec-driven contract testing with Schemathesis or Dredd is not possible until a contract is added.

Recommendation: add an OpenAPI document for `/healthz`, `/v1/health`, `/v1/rules`, `/v1/analyze`, and `/v1/apply`, then validate request and response shapes in CI.

### S3-2: No formal load or SLO tooling

The local burst test is useful, but it is not a substitute for k6, JMeter, Gatling, or another load test with thresholds.

Recommendation: define MVP SLOs for local API latency and add a small k6 script once public API behavior stabilizes.

### S3-3: Resource limits are not documented as a contract

Malformed and invalid JSON paths return appropriate status codes, but the API does not document request size limits, rate limits, or abuse posture.

Recommendation: document the local-server threat model and, if the API becomes remotely exposed, add explicit body-size and rate-limit policy.

## Not Verified

- Two-account BOLA and authorization tests: not applicable because the app has no accounts, tenants, or auth.
- Database, cache, queue, migration, and transaction tests: not applicable because the app has no persistent service dependencies.
- Active DAST with OWASP ZAP: not run because ZAP is not installed and this is a local MVP.
- Spec-driven contract tests: not run because no OpenAPI/JSON Schema contract exists.
- Formal load/SLO test: not run because no load tool or SLO threshold exists.

## Conclusion

The app passed comprehensive local testing for the current public MVP surface: Rust gates, CLI, API, Docker, eval, supply-chain policy, source hygiene, smoke scripts, and fresh clone from `v0.1.0`.
