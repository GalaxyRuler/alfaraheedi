# Browser Extension v0.7 Validation Summary

This is the public-safe validation summary for the Alfaraheedi v0.7 browser
extension foundation. Detailed VM evidence logs are intentionally kept out of
the public release branch under `docs/testing/reports/` because they can contain
local guest artifact paths and private QA-machine identifiers.

## Scope

The v0.7 extension is a Manifest V3 browser-extension foundation for editable
web fields. It connects only to the configured loopback Alfaraheedi local API,
stores only extension settings, avoids telemetry and hosted services, and does
not claim live Gmail, WhatsApp Web, Google Docs, Word, or PowerPoint integration
until those exact surfaces have separate current verification.

## Automated Local Gates

The standard local gate is:

```powershell
.\scripts\validate-browser-extension-release.ps1
```

This gate runs the browser-extension runtime, settings, and package suites,
validates the package helper syntax, parses release PowerShell scripts, checks
store assets and privacy-page source, checks manual release gates, runs
public-release hygiene, rebuilds the extension package, and verifies the
package zip entries.

The local release-candidate handoff gate is:

```powershell
.\scripts\prepare-browser-extension-release-candidate.ps1
```

This gate runs the standard preflight, refreshes the store-submission bundle,
checks bundle integrity, and enforces local readiness. The standalone integrity
check is:

```powershell
.\scripts\check-browser-extension-store-submission-integrity.ps1 -RequireValid
```

It verifies package, reviewer-doc, and screenshot records from
`RELEASE_MANIFEST.json`, and requires `ScreenshotRootsMatch: true` so the
store-bundle screenshot root still matches the selected root in
`browser-extension/STORE_ASSETS.md`. Store readiness remains false until
external account-side gates are complete.

## Packaged VM Gates

Fresh packaged VM evidence should be gathered before browser-store upload prep:

```powershell
.\scripts\validate-browser-extension-release.ps1 -RunVmSmokes -VmName <vm-name> -CredentialPath <credential.xml> -ChromeForTestingZipPath <chrome-for-testing-win64.zip>
```

With `-RunVmSmokes`, the preflight runs:

- Packaged Edge Accessibility Tree smoke.
- Packaged production-editor fixture smoke.
- Packaged store screenshot capture.
- Packaged Edge keyboard-flow smoke.
- Packaged Chrome for Testing keyboard-flow smoke.

VM smoke scripts write guest-side artifacts under `C:\Temp\Alfaraheedi` by
default. Set `ALFARAHEEDI_VM_QA_ROOT`, or pass `-QaRoot <guest-path>`, when a
QA machine needs a different guest artifact root.

The packaged store screenshot capture also copies the generated PNGs back under
`dist\browser-extension-store-assets\<qa-run>\` and returns that copied path as
`LocalScreenshotRoot`. The store-submission bundle uses the screenshot root
selected in `browser-extension/STORE_ASSETS.md`, not an implicit latest VM run.

## Current Evidence

As of 2026-06-23 local time, the source-controlled local gates have fresh passing evidence
for the browser-extension runtime, settings, and package suites, release
preflight, public-release hygiene, release-candidate handoff, generated release
handoff, and store-bundle integrity. The latest VM release-preflight pass also
returned `Ok: true` for the
packaged Edge Accessibility Tree smoke, packaged Edge production-editor fixture
smoke, packaged Edge store screenshot capture, packaged Edge keyboard-flow
smoke, and packaged Chrome for Testing keyboard-flow smoke.

The current selected store screenshot set is
`dist\browser-extension-store-assets\v0.7-extension-store-screenshots-20260623-030207`.
The release handoff records both the selected screenshot root and the actual
store-bundle screenshot root so reviewer artifacts can be checked for drift.
The latest local store-bundle integrity check reported `ScreenshotRootsMatch:
true` for that selected set.

GitHub Pages is configured for `GalaxyRuler/alfaraheedi` in workflow mode with
HTTPS enforced. The Pages workflow and static privacy page still must be merged
to `main` and deployed before the public privacy URL can be used for store
submission.

The Chrome for Testing keyboard-flow smoke used Chrome for Testing
`150.0.7871.24` and verified options-page tab order, popup tab order, rendered
suggestion-panel focus, keyboard Apply, and suggestion-panel cleanup after
Apply. Keep running the VM command above with `-ChromeForTestingZipPath
<chrome-for-testing-win64.zip>` before claiming current Chrome for Testing VM
coverage for a store-upload candidate.

## Public-Release Hygiene

The public-release hygiene gate is:

```powershell
.\scripts\check-public-release-hygiene.ps1 -RequireClean
```

It verifies generated release artifacts, private manual QA reports, private VM
evidence reports, local planning files, internal agent folders, frontend test
reports, and environment files are ignored or removed from the public release
set. It also scans public source docs for local workstation paths, local
QA-machine identifiers, and internal agent references.

## Store Upload Boundary

Before public store submission:

- Publish and verify the browser-extension privacy page at the configured public
  URL.
- Complete live production-editor QA for the exact supported surfaces.
- Complete a manual screen-reader review.
- Review selected screenshots and listing copy against the claims boundary.
- Submit through Chrome Web Store and Edge Add-ons dashboards.

Until those account-side gates are complete, `StoreReady` is expected to remain
`false` even when `LocalReady` is `true`.
