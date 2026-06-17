# Contributing

By contributing, you agree that your contributions are licensed under `MIT OR Apache-2.0`.

Development gates:

```powershell
cargo fmt --all --check
cargo test --workspace
cargo run -p write-eval
```

Rules that can auto-apply must have focused tests and seed eval coverage. Auto-apply rules target at least 99.5% precision; suggest-only rules target at least 98% precision before promotion.

Do not commit private datasets, model weights, API keys, local `.env` files, or agent/process artifacts.
