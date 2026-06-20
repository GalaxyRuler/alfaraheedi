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
- [ ] `npm run desktop:build` in `frontend/`
- [ ] `.\scripts\smoke-cli.ps1`
- [ ] `.\scripts\smoke-api.ps1`
- [ ] `cargo run -p write-cli -- llm doctor`
- [ ] `.\scripts\smoke-llm.ps1 -MockRuntime`
- [ ] Real local LLM smoke with a user-provided GGUF, when releasing LLM-facing changes
- [ ] `.\scripts\smoke-docker.ps1`
- [ ] `.\scripts\package-windows.ps1 -Version <version>` for the optional CLI/developer zip
- [ ] Windows desktop installer produced as `Alfaraheedi-<version>-windows-x64-setup.exe`
- [ ] Manual desktop companion QA: Notepad, browser textarea, Word, PowerPoint, WhatsApp, no selection, clipboard restore, large selection, Arabic UI, English UI, offline
- [ ] Fresh clone test
- [ ] README reviewed
- [ ] Limitations reviewed
- [ ] Open feedback classified using `docs/feedback-triage.md`
- [ ] Public-safe rule feedback has eval fixtures or documented deferral/rejection
- [ ] Patch versus next-minor criteria reviewed for the release scope
- [ ] Changelog updated
- [ ] GitHub release notes written
- [ ] Tag created
- [ ] Recommended desktop installer uploaded
- [ ] Optional developer CLI zip uploaded, if included

## Patch Release Preflight

Before cutting a patch release, confirm the change fixes a defect in the current public release that affects privacy, safe auto-apply correctness, installability, release verification, the packaged workbench, or unsafe public documentation.

Rule-related patch releases must keep `cargo run -p write-eval` green and link reported false positives or false negatives to public-safe fixtures when possible.

## Release Candidate Notes

- [x] `v0.1.0-rc.1` passed fresh-clone verification on Windows.
