# Release Checklist

- [ ] Clean git status
- [ ] `cargo fmt --all --check`
- [ ] `cargo clippy --workspace -- -D warnings`
- [ ] `cargo test --workspace`
- [ ] `cargo run -p write-eval`
- [ ] `cargo deny check licenses bans sources`
- [ ] `npm ci` in `frontend/`
- [ ] `npm run lint` in `frontend/`
- [ ] `npm run test` in `frontend/`
- [ ] `npm run build` in `frontend/`
- [ ] `npm run test:e2e` in `frontend/`
- [ ] `.\scripts\smoke-cli.ps1`
- [ ] `.\scripts\smoke-api.ps1`
- [ ] `.\scripts\smoke-llm.ps1 -MockRuntime`
- [ ] Real local LLM smoke with a user-provided GGUF, when releasing LLM-facing changes
- [ ] `.\scripts\smoke-docker.ps1`
- [ ] `.\scripts\package-windows.ps1 -Version <version>`
- [ ] Fresh clone test
- [ ] README reviewed
- [ ] Limitations reviewed
- [ ] Changelog updated
- [ ] GitHub release notes written
- [ ] Tag created
- [ ] Windows release zip uploaded

## Release Candidate Notes

- [x] `v0.1.0-rc.1` passed fresh-clone verification on Windows.
