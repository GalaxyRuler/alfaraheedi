## Summary

## Verification

- [ ] `cargo fmt --all --check`
- [ ] `cargo clippy --workspace -- -D warnings`
- [ ] `cargo test --workspace`
- [ ] `cargo run -p write-eval`
- [ ] `cargo deny check licenses bans sources`

## Scope Check

- [ ] No restricted datasets or model weights
- [ ] No raw user text logging
- [ ] No morphology-dependent auto-fix rules
- [ ] New rule has tests and eval coverage
