## Summary

## Verification

- [ ] `cargo fmt --all --check`
- [ ] `cargo clippy --workspace -- -D warnings`
- [ ] `cargo test --workspace`
- [ ] `cargo run -p write-eval`
- [ ] `cargo deny check licenses bans sources`
- [ ] `npm run lint` in `frontend/`
- [ ] `npm run typecheck` in `frontend/`
- [ ] `npm test -- --minWorkers=1 --maxWorkers=2 --reporter=dot` in `frontend/`
- [ ] `.\scripts\check-public-release-hygiene.ps1 -RequireClean`
- [ ] Windows smoke CI covers `smoke-cli.ps1`, `smoke-api.ps1`, `cargo run -p write-cli -- llm doctor`, and `smoke-llm.ps1 -MockRuntime`
- [ ] Desktop Windows CI builds and uploads the canonical setup installer
- [ ] `.\scripts\validate-browser-extension-release.ps1` when browser-extension files, privacy pages, store assets, or extension release scripts changed
- [ ] Browser-extension CI artifact contains the upload zip, `RELEASE_MANIFEST.json`, reviewer docs, and selected screenshots

## Scope Check

- [ ] No restricted datasets or model weights
- [ ] No raw user text logging
- [ ] No morphology-dependent auto-fix rules
- [ ] New rule has tests and eval coverage

## Browser Extension Release Check

- [ ] Manifest permissions remain limited to `storage` plus HTTP loopback host permissions
- [ ] Runtime extension files remain free of telemetry, raw text logging, hosted API calls, and remote-code execution primitives
- [ ] `.\scripts\prepare-browser-extension-release-candidate.ps1` passes before release handoff
- [ ] `.\scripts\export-browser-extension-release-handoff.ps1` generated a local Markdown/JSON handoff for review
- [ ] `.\scripts\get-browser-extension-release-readiness.ps1 -RequireLocalReady` passes before handoff, including `StoreSubmissionIntegrity` and `ManualQaReportGateHashMatches`
- [ ] `.\scripts\validate-browser-extension-release.ps1 -RunVmSmokes ...` has fresh evidence before browser-store upload prep
- [ ] GitHub Pages/privacy URL readiness is checked with `.\scripts\check-browser-extension-pages-readiness.ps1`
- [ ] Live production-editor QA, manual screen-reader review, and store-dashboard review are completed before public store submission
