# Alfaraheedi

## What It Is

Alfaraheedi is an early Rust-native, local-first Arabic writing checker focused on high-precision safe corrections and correct Unicode offsets. It is not yet a full Arabic grammar checker.

The current MVP provides a shared Rust engine, a local CLI, an Axum JSON API, Docker runtime support, and a small release eval gate. It is designed to keep Arabic text on the user's machine by default.

## What It Is Not

Alfaraheedi is not a hosted writing service, a browser extension, an LSP server, a spell checker, an Arabic morphology engine, or an English grammar checker. It does not bundle corpora, dictionaries, model weights, or non-commercial datasets.

## Current Rules

The current Arabic rule set is intentionally small:

| Rule source | Status | Behavior |
| --- | --- | --- |
| `arabic:tatweel` | Safe auto-apply | Removes tatweel elongation marks. |
| `arabic:repeated-space` | Safe auto-apply | Collapses repeated spaces in Arabic text. |
| `arabic:latin-comma` | Suggest-only | Suggests Arabic comma punctuation in Arabic context. |
| `arabic:latin-question-mark` | Suggest-only | Suggests Arabic question mark punctuation in Arabic context. |
| `arabic:space-before-punctuation` | Suggest-only | Suggests removing a space before Arabic punctuation. |

Safe auto-apply rules are eligible for `writecheck fix --safe`. Suggest-only rules are reported but not applied automatically.

## Install And Build

Install a current Rust toolchain, then build and test from the repository root:

```powershell
cargo build --workspace
cargo test --workspace
```

The release gate also expects:

```powershell
cargo fmt --all --check
cargo clippy --workspace -- -D warnings
cargo deny check licenses bans sources
```

## CLI Usage

Check a file and print JSON suggestions:

```powershell
cargo run -p write-cli -- check --format json path\to\file.txt
```

Apply only safe fixes and print the fixed text:

```powershell
cargo run -p write-cli -- fix --safe path\to\file.txt
```

Write safe fixes to a separate file:

```powershell
cargo run -p write-cli -- fix --safe path\to\file.txt --output path\to\fixed.txt
```

Run the local API server through the CLI:

```powershell
cargo run -p write-cli -- serve --addr 127.0.0.1:3000
```

Inspect the optional local LLM policy and CPU model candidates:

```powershell
cargo run -p write-cli -- llm status
cargo run -p write-cli -- llm status --format json
```

CLI smoke test:

```powershell
.\scripts\smoke-cli.ps1
```

## API Usage

The API exposes the same default rule set as the CLI.

```http
GET  /healthz
GET  /v1/health
GET  /v1/rules
GET  /v1/llm/status
POST /v1/analyze
POST /v1/apply
```

Analyze text:

```powershell
$body = @{ text = "مرحبــا  بالعالم" } | ConvertTo-Json
Invoke-RestMethod -Uri http://127.0.0.1:3000/v1/analyze -Method Post -ContentType "application/json" -Body $body
```

Apply safe fixes:

```powershell
$body = @{ text = "مرحبــا  بالعالم"; mode = "safe" } | ConvertTo-Json
Invoke-RestMethod -Uri http://127.0.0.1:3000/v1/apply -Method Post -ContentType "application/json" -Body $body
```

API smoke test:

```powershell
.\scripts\smoke-api.ps1
```

## Docker

Build and run the local image:

```powershell
docker build -t alfaraheedi:local .
docker run -p 3000:3000 alfaraheedi:local
Invoke-RestMethod -Uri http://127.0.0.1:3000/healthz
```

Docker smoke test:

```powershell
.\scripts\smoke-docker.ps1
```

## Evaluation

The public MVP uses a small seed eval suite as a release gate for the currently shipped rules. It is not evidence of broad Arabic grammar coverage.

```powershell
cargo run -p write-eval
```

The command prints JSON, including rule-level metrics and explicit failure details, and exits non-zero on release-gating failures.

## Privacy

Alfaraheedi is local-first by default. The CLI, API, Docker image, and eval tooling do not require sending text to a hosted service.

Project policy treats raw user text logging, retained analyzed text, and unredacted telemetry as privacy bugs. See `docs/privacy.md`.

## Data And Licensing

The code is licensed under `MIT OR Apache-2.0`. Code licenses and data licenses are tracked separately.

The repository does not bundle corpora, dictionaries, model weights, GPL-linked code, or non-commercial datasets. See `docs/model-data-policy.md`.

## Optional Local LLM

The local LLM track is suggestion-only. The built-in catalog currently points at CPU-capable GGUF candidates such as `qwen3-1.7b-q4_k_m`, but Alfaraheedi does not download or redistribute model weights by default. LLM output is not eligible for `fix --safe`.

## Roadmap

Near-term work after the public MVP:

- Broaden the release eval suite before promoting any new safe auto-apply rule.
- Add normalization checks only when reversible offset maps are proven.
- Keep dictionary and morphology work behind clear licensing and accuracy gates.
- Add editor, LSP, or hosted integrations only after the local engine contract is stable.

## Known Limitations

- Not a full Arabic grammar checker.
- No Arabic morphology or context-heavy grammar correction.
- No spell checking.
- No English grammar layer.
- No browser extension, editor integration, or LSP server.
- No hosted service or telemetry pipeline.
- Current eval coverage is small and release-gate oriented.
