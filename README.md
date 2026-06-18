# Alfaraheedi

Rust-first Arabic-English writing engine, currently focused on the Arabic MVP spine:

- Unicode-safe byte, UTF-16, and grapheme offsets.
- Protected spans for URLs, emails, and inline code.
- Safe Arabic rules for tatweel and repeated spaces.
- Display-only Arabic punctuation suggestions.
- Patch application for safe fixes.
- CLI, JSON API, and seed eval gate.

## Commands

```powershell
cargo test --workspace
cargo run -p write-eval
cargo run -p write-cli -- check --format json path\to\file.txt
cargo run -p write-cli -- serve --addr 127.0.0.1:3000
```

API:

```http
GET  /healthz
GET  /v1/health
POST /v1/analyze
```

## Smoke Tests

```powershell
.\scripts\smoke-cli.ps1
.\scripts\smoke-api.ps1
```

## MVP Boundary

English/Harper, spell dictionaries, WASM editor integration, LSP, desktop, ML, and Python sidecars are intentionally deferred until the core apply/eval/API contract is stable.
