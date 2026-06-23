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
- [ ] For browser-extension changes: `.\scripts\validate-browser-extension-release.ps1`
- [ ] For public release hygiene: `.\scripts\check-public-release-hygiene.ps1 -RequireClean`
- [ ] For browser-extension pull requests: confirm the CI artifact `nahou-browser-extension-0.7.0-release-artifacts` contains the upload zip, `RELEASE_MANIFEST.json`, reviewer docs, and selected screenshots
- [ ] For browser-extension release candidates: `.\scripts\prepare-browser-extension-release-candidate.ps1` and confirm `LocalReady: true` and `ScreenshotRootsMatch: true`
- [ ] For browser-extension release handoff: `.\scripts\export-browser-extension-release-handoff.ps1` and review the generated Markdown/JSON under `dist\browser-extension-release-handoff\`
- [ ] For browser-extension validation evidence: review `docs/testing/browser-extension-v0.7-validation.md`; keep detailed VM logs under ignored `docs/testing/reports\`
- [ ] For browser-extension release candidates: `.\scripts\validate-browser-extension-release.ps1 -RunVmSmokes -VmName <vm-name> -CredentialPath <credential.xml> -ChromeForTestingZipPath <chrome-for-testing-win64.zip>`
- [ ] For browser-extension VM smokes: use the default guest artifact root under `C:\Temp\Nahou`, or set `ALFARAHEEDI_VM_QA_ROOT` / pass `-QaRoot <guest-path>` when the QA VM needs a different guest path
- [ ] For browser-extension release candidates: `.\scripts\export-browser-extension-store-submission.ps1`
- [ ] For browser-extension release candidates: `.\scripts\check-browser-extension-store-submission-integrity.ps1 -RequireValid`
- [ ] For browser-extension release candidates: `.\scripts\get-browser-extension-release-readiness.ps1 -RequireLocalReady` and confirm `StoreUploadPackageMatchesPackage`, `ReleaseManifestPackageHash`, `ReleaseManifestReviewerDocs`, `ReleaseManifestScreenshots`, `StoreSubmissionIntegrity`, and `ManualQaReportGateHashMatches` are all `true`; before public release, also confirm `ManualQaReportCompleted: true` and `ManualQaReleaseDecision: Public release approved`
- [ ] Before browser-store upload: `.\scripts\check-browser-extension-pages-readiness.ps1 -RequireReady`
- [ ] Before public browser-store release: complete `browser-extension/MANUAL_RELEASE_GATES.md` for live production-editor QA, manual screen-reader review, public privacy URL, and store-dashboard review, then run `.\scripts\check-browser-extension-manual-qa-report.ps1 -RequireCompleted`
- [ ] For Office add-ins changes: `.\scripts\validate-office-addins-release.ps1`
- [ ] Package Office add-ins with `.\scripts\package-office-addins.ps1`
- [ ] For local Office sideload checks: create a dev certificate with `.\scripts\New-OfficeAddinDevCertificate.ps1`; use `-Trust` only when you accept a CurrentUser certificate store change
- [ ] Start the Office task-pane host with `.\scripts\serve-office-addins.ps1` and verify `https://localhost:3443/office-addins/taskpane.html`
- [ ] Treat v0.8 Office add-ins as a task-pane foundation until sideload QA and Word/PowerPoint replacement checks are complete
- [ ] `.\scripts\smoke-cli.ps1`
- [ ] `.\scripts\smoke-api.ps1`
- [ ] `cargo run -p write-cli -- llm doctor`
- [ ] `.\scripts\smoke-llm.ps1 -MockRuntime`
- [ ] Windows smoke CI covers CLI, API, LLM doctor, and mock local LLM smoke
- [ ] Real local LLM smoke with a user-provided GGUF, when releasing LLM-facing changes
- [ ] `.\scripts\smoke-docker.ps1`
- [ ] `.\scripts\package-windows.ps1 -Version <version>` for the optional CLI/developer zip
- [ ] Windows desktop installer produced as `Nahou-<version>-windows-x64-setup.exe`
- [ ] Desktop installer bundle folder contains only the recommended setup installer, not stale or raw Tauri `Nahou_*_x64-setup.exe` files
- [ ] `.\scripts\check-desktop-installer-bundle.ps1`
- [ ] Desktop Windows CI artifact `nahou-desktop-windows-setup` contains the canonical setup installer
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
