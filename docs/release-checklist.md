# Release Checklist

- [ ] Clean git status
- [ ] Public v1.0 claims match `docs/public/v1.0-product-contract.md`
- [ ] For V2A work, public V2 claims match `docs/public/v2-product-contract.md`
- [ ] For V2A work, `docs/testing/v2-acceptance-matrix.md` has source-controlled gates for supported browser text fields, stale apply, privacy settings, accessibility, real-site manual evidence, and store readiness
- [ ] V2A is described as a browser-first local-ready release-candidate lane only when release-candidate evidence explicitly supports the claim
- [ ] V2B desktop overlay support and Office live underlines remain separately gated and deferred unless explicitly rescoped
- [ ] V2A security and privacy docs reviewed: `docs/security/v2-browser-extension-threat-model.md` and `docs/security/v2-browser-extension-privacy-review.md`
- [ ] No V2A release or store copy claims full grammar checking, every website, every rich editor, desktop-wide live overlay support, Office live underlines, hosted processing, bundled model weights, automatic LLM rewriting, or store approval before account-side gates
- [ ] `docs/testing/v1.0-acceptance-matrix.md` has public-safe evidence files for each release-blocking desktop-foundation surface
- [ ] No public page claims universal live desktop overlays, hosted processing, bundled model weights, complete Arabic morphology, full English grammar, or store approval that has not happened
- [ ] Desktop installer remains the primary v1.0 user artifact
- [ ] Supported v1.0 desktop-foundation surface reviewed: packaged desktop selected-text flow with Notepad as the representative target
- [ ] Browser extension, live web editors, Office add-ins, Word, and PowerPoint are documented as deferred integration gates unless this release explicitly includes them
- [ ] Quality thresholds reviewed: zero known supported-surface crashes, no raw text in logs/reports/screenshots/public artifacts, zero known false positives in release-blocking safe-fix fixtures, installer launches without PowerShell, clipboard restore works in normal text-clipboard cases
- [ ] `cargo fmt --all --check`
- [ ] `cargo clippy --workspace -- -D warnings`
- [ ] `cargo test --workspace`
- [ ] `cargo run -p write-eval`
- [ ] `cargo deny check licenses bans sources`
- [ ] `npm audit --omit=dev` in `frontend/` for release context; classify any issues as runtime/dev, exploitable/not exploitable, patched/deferred
- [ ] Staged secret scan after `git add` and before release PR commits
- [ ] `docs/security/v1.0-threat-model.md` reviewed against desktop hotkey, clipboard, UIA, browser content scripts, Office add-ins, local API, local LLM runtime, release artifacts, and update/signing path
- [ ] `docs/security/v1.0-privacy-review.md` reviewed for data processed, storage, retention, logs, reports, screenshots, extension permissions, and Office permissions
- [ ] `npm ci` in `frontend/`
- [ ] `npm run lint` in `frontend/`
- [ ] `npm run test` in `frontend/`
- [ ] `npm run build` in `frontend/`
- [ ] `npm run test:e2e` in `frontend/`
- [ ] `npm run desktop:build` in `frontend/`
- [ ] For browser-extension changes: `.\scripts\validate-browser-extension-release.ps1`
- [ ] For public release hygiene: `.\scripts\check-public-release-hygiene.ps1 -RequireClean`
- [ ] Manual log and screenshot review confirms no raw selected text in public artifacts or source-controlled reports
- [ ] For browser-extension pull requests: confirm the CI artifact `nahou-browser-extension-2.0.0.1-ci-preflight-artifacts` contains the upload zip, `RELEASE_MANIFEST.json`, reviewer docs, and V2 validation summary; because CI runs with `-AllowMissingScreenshots`, do not treat this artifact as the complete store-submission bundle
- [ ] For browser-extension local-ready artifacts: `.\scripts\prepare-browser-extension-release-candidate.ps1` and confirm `LocalReady: true` and `ScreenshotRootsMatch: true`
- [ ] For browser-extension handoff artifacts: `.\scripts\export-browser-extension-release-handoff.ps1` and review the generated Markdown/JSON under `dist\browser-extension-release-handoff\`
- [ ] For browser-extension validation evidence: review `docs/testing/browser-extension-v0.7-validation.md`; keep detailed VM logs under ignored `docs/testing/reports\`
- [ ] For V2A browser-extension evidence: review `docs/testing/browser-extension-v2-validation.md`; record unstable real-site behavior as a documented limitation before public claims
- [ ] For browser-extension packaged VM evidence, when browser-store readiness is in scope: `.\scripts\validate-browser-extension-release.ps1 -RunVmSmokes -VmName <vm-name> -CredentialPath <credential.xml> -ChromeForTestingZipPath <chrome-for-testing-win64.zip>`
- [ ] For browser-extension VM smokes, when browser-store readiness is in scope: use the default guest artifact root under `C:\Temp\Nahou`, or set `ALFARAHEEDI_VM_QA_ROOT` / pass `-QaRoot <guest-path>` when the QA VM needs a different guest path
- [ ] For browser-extension store-submission artifacts, when browser-store readiness is in scope: `.\scripts\export-browser-extension-store-submission.ps1`
- [ ] For browser-extension store-submission artifacts, when browser-store readiness is in scope: `.\scripts\check-browser-extension-store-submission-integrity.ps1 -RequireValid`
- [ ] For browser-extension local-ready release candidates: `.\scripts\get-browser-extension-release-readiness.ps1 -RequireLocalReady` and confirm `StoreUploadPackageMatchesPackage`, `ReleaseManifestPackageHash`, `ReleaseManifestReviewerDocs`, `ReleaseManifestScreenshots`, `StoreSubmissionIntegrity`, and `ManualQaReportGateHashMatches` are all `true`; before public browser-store release, also confirm `ManualQaReportCompleted: true` and `ManualQaReleaseDecision: Public release approved`
- [ ] Before browser-store upload, when browser-store readiness is in scope: `.\scripts\check-browser-extension-pages-readiness.ps1 -RequireReady`
- [ ] Before public browser-store release, when browser-store readiness is in scope: complete `browser-extension/MANUAL_RELEASE_GATES.md` for live production-editor QA, manual screen-reader review, public privacy URL, and store-dashboard review, then run `.\scripts\check-browser-extension-manual-qa-report.ps1 -RequireCompleted`
- [ ] For Office add-ins changes: `.\scripts\validate-office-addins-release.ps1`
- [ ] Package Office add-ins with `.\scripts\package-office-addins.ps1`
- [ ] For local Office sideload checks: create a dev certificate with `.\scripts\New-OfficeAddinDevCertificate.ps1`; use `-Trust` only when you accept a CurrentUser certificate store change
- [ ] Start the Office task-pane host with `.\scripts\serve-office-addins.ps1` and verify `https://localhost:3443/office-addins/taskpane.html`
- [ ] For Office add-ins manual sideload QA, when Office sideload readiness is in scope: generate `.\scripts\new-office-addins-manual-qa-report.ps1`, complete Word/PowerPoint gates, then run `.\scripts\check-office-addins-manual-qa-report.ps1 -RequireCompleted`
- [ ] Treat v1.0 Office add-ins as a task-pane foundation until sideload QA and Word/PowerPoint replacement checks are complete
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
- [ ] For v0.9 UI Automation changes: verify the review header identifies `Windows UI Automation capture` for a supported native control and `Clipboard capture` for fallback surfaces
- [ ] Confirm v0.9 UI Automation remains capture-only and replacement still uses clipboard paste fallback
- [ ] Manual desktop companion QA for foundation scope: Notepad selected-text capture/review, no-selection or unsupported-selection behavior, clipboard restore diagnostics, and no raw text in public artifacts
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
