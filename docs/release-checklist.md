# Release Checklist

- [ ] Clean git status
- [ ] `cargo fmt --all --check`
- [ ] `cargo clippy --workspace -- -D warnings`
- [ ] `cargo test --workspace`
- [ ] `cargo run -p write-eval`
- [ ] `cargo deny check licenses bans sources`
- [ ] `.\scripts\smoke-cli.ps1`
- [ ] `.\scripts\smoke-api.ps1`
- [ ] `.\scripts\smoke-docker.ps1`
- [ ] Fresh clone test
- [ ] README reviewed
- [ ] Limitations reviewed
- [ ] Changelog updated
- [ ] GitHub release notes written
- [ ] Tag created
