# Browser Extension Store Submission Notes

These notes are the source-of-truth preflight for Chrome Web Store and Edge
Add-ons submission. They do not prove store approval; they document the fields
and claims that must remain true before upload.

Current policy references checked on 2026-06-30:

- Chrome Web Store Program Policies:
  <https://developer.chrome.com/docs/webstore/program-policies/policies>
- Chrome Web Store privacy fields:
  <https://developer.chrome.com/docs/webstore/cws-dashboard-privacy>
- Microsoft Edge Add-ons developer policies:
  <https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies>
- Microsoft Edge extension publishing flow:
  <https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension>

## Single Purpose

Nahou provides local-first writing suggestions for editable web fields.
It detects focused editable fields, checks pause and disabled-site settings,
sends the current text only to the configured loopback local API, and renders
page-local suggestions that the user can review or apply.

Chrome single-purpose field:

```text
Nahou provides local-first writing suggestions for editable web fields.
When enabled and not disabled for the current site, it checks text in focused
web text fields by sending that text only to the user's configured loopback
Nahou API, then shows suggestions near the field for review or manual apply.
```

Short store summary:

```text
Local-first writing suggestions for editable web fields.
```

Long store description:

```text
Nahou is a local-first writing companion for editable web fields. It
checks text in focused textareas, safe text-like inputs, iframe-hosted fields,
open Shadow DOM fields, and supported contenteditable editors. Suggestions are
shown in a compact page-local panel and are applied only when the user accepts
them.

The extension connects only to a loopback Nahou API configured in
settings. It does not use a hosted writing service, telemetry, analytics, or
raw text logging. It skips password fields, read-only or disabled fields,
sensitive-looking fields, and sensitive-looking ancestor containers. Checking
can be paused from the toolbar popup or options page, and users can disable or
re-enable checking for the current site from the toolbar popup.

This V2A browser-first local-ready build does not yet claim site-specific
Gmail, WhatsApp Web, or Google Docs integrations. Those editors may work when
their editable field is compatible with the generic web-field layer, but live
production-editor behavior still needs separate QA before store release claims
are broadened.
```

## Permission Justifications

- `storage`: stores extension settings only, including the local API URL,
  writing mode, enabled/paused state, and user-selected disabled-site hostnames.
- `host_permissions`: limited to `http://127.0.0.1/*` and
  `http://localhost/*` so the service worker can call the user's local API.
- `content_scripts`: run on `http://*/*` and `https://*/*` pages at
  `document_idle` with `all_frames: true` so editable fields inside matching
  page frames can be checked.

Chrome permission field text:

```text
storage: Used only to save Nahou extension settings, including the local
API URL, writing mode, enabled/paused state, and disabled-site hostnames.

http://127.0.0.1/* and http://localhost/*: Used only by the extension service
worker to call the user's local Nahou API. The extension does not call a
hosted writing API.

http://*/* and https://*/* content scripts: Required to detect and assist
editable text fields on web pages. The content script checks only the active
editable field, skips sensitive-looking fields, and can be paused globally or
disabled for the current site by the user. The content script checks the
enabled and disabled-site settings before sending active-field text to the
extension runtime.
```

## Privacy Claims

- No telemetry.
- No hosted analytics.
- No remote writing API.
- No raw editor text logging.
- No remote code execution, remote script loading, `eval`, `new Function`, or
  `importScripts`.
- Text is sent only to the configured HTTP `127.0.0.1` or `localhost` API URL.
- The extension can be paused from the toolbar popup or options page.
- The extension can be disabled and re-enabled for the current site from the
  toolbar popup.
- The content script checks enabled and disabled-site settings before sending
  active-field text to the extension runtime.
- The service worker repeats the same settings gate before calling the local
  API.
- Health and status checks do not include editor text.
- The service worker rejects blank, malformed, and oversized analysis messages
  before calling the local API.
- Sensitive-looking fields and sensitive ancestor containers are skipped before
  analysis.

Chrome privacy-practices answers:

- Single purpose: use the text from the `Chrome single-purpose field` above.
- Permission justifications: use the text from `Chrome permission field text`.
- Remote code: `No, I am not using remote code.`
- Data sale: `No`.
- Data use for unrelated purposes: `No`.
- Human review of user content: `No`; the extension sends text only to the
  user's local loopback API and does not provide any hosted human review.
- Privacy policy URL: required before upload because editable text can be user
  data. Publish `browser-extension/PRIVACY_POLICY.md` and use that URL. This
  repo prepares a GitHub Pages copy at
  `docs/public/browser-extension/privacy.html`; after the Pages workflow is
  enabled and deployed from `main`, the expected project URL is
  `https://galaxyruler.github.io/alfaraheedi/browser-extension/privacy.html`.
  The linked policy must state that the extension sends active-field text only
  to the configured local loopback API after pause and disabled-site gates, does
  not log raw editor text, does not use telemetry, and does not transfer text to
  Nahou-hosted services.
- Chrome limited-use disclosure: no sale of extension data, no telemetry or
  advertising use, local processing through the configured loopback Nahou API
  only, and no transfer of editor text to Nahou-hosted services.

Microsoft Edge Partner Center notes:

- Visibility: keep `Hidden` for first submission/private QA unless the user is
  ready for public discovery; switch to `Public` only after live-editor and
  manual accessibility checks are complete.
- Category: `Productivity`.
- Mature content: `No`.
- Privacy policy requirements: select `Yes` and provide the same privacy policy
  URL used for Chrome.
- Website/support: provide project website or repository support URL before
  public release.
- Promotional tiles: optional for first submission; if provided, keep imagery
  consistent with the generated screenshots and do not imply live Gmail,
  WhatsApp Web, or Google Docs support until that is verified.

Reviewer notes:

```text
Nahou is local-first. This V2A browser-first local-ready build sends active
editable-field text only to a loopback API configured by the user, defaulting
to localhost/127.0.0.1.
There is no hosted writing API, telemetry, analytics, remote code execution, or
raw text logging. The extension can be paused from the toolbar popup or options
page and disabled for the current site from the toolbar popup. The content
script checks the enabled and disabled-site settings before sending active-field
text to the extension runtime, and the service worker repeats the same settings
gate before calling the local API. Password fields, read-only/disabled fields,
sensitive-looking fields, and sensitive-looking ancestor containers are skipped
before analysis. Health and status checks do not include editor text.

To test manually, run the local Nahou API, configure the extension API URL
to the loopback address, type "helo wat you are do?" in a normal textarea, wait
for the suggestion panel, then apply the "hello" suggestion.
```

## Not Yet Submitted

This package has not been submitted to Chrome Web Store or Edge Add-ons. Before
submission, run the package tests and packaged VM smoke suite, then complete a
manual review of the generated store listing, screenshots, privacy disclosures,
and reviewer notes against the current browser store policy pages.

Run the local browser-extension release preflight from the repository root:

```powershell
.\scripts\validate-browser-extension-release.ps1
```

Prepare a local release-candidate handoff bundle with one command:

```powershell
.\scripts\prepare-browser-extension-release-candidate.ps1
```

This wrapper runs the release preflight, refreshes the store-submission export,
validates bundle integrity, and enforces local readiness. It still reports
store readiness as blocked until the public privacy URL, live-editor QA,
manual screen-reader review, and store-dashboard work have current evidence.

Export a human-readable release handoff packet for PR or store-prep review:

```powershell
.\scripts\export-browser-extension-release-handoff.ps1
```

The handoff exporter writes Markdown and JSON under
`dist\browser-extension-release-handoff\`, including local readiness, selected
artifact paths, VM evidence roots when requested, and remaining external
blockers. It must not be edited to include private account text, tokens, store
dashboard identifiers, or private screenshots.

Export a local upload-prep bundle after preflight with:

```powershell
.\scripts\export-browser-extension-store-submission.ps1
```

The export writes
`dist\browser-extension-store-submission\nahou-browser-extension-1.0.0.1-store-submission\`
with the upload zip, reviewer docs, privacy policy source, store asset
checklist, selected screenshots, and `RELEASE_MANIFEST.json` containing SHA-256
hashes and byte counts for the upload package, reviewer docs, and screenshots.
The bundle is still local prep only; the
privacy policy must be published at a stable public URL before Chrome Web Store
or Edge Add-ons upload.

Verify the exported bundle integrity before account-side upload:

```powershell
.\scripts\check-browser-extension-store-submission-integrity.ps1 -RequireValid
```

This verifies `RELEASE_MANIFEST.json` file records, package and reviewer-doc
hashes, selected screenshots, and `ScreenshotRootsMatch: true` between the
source-controlled screenshot selection in `STORE_ASSETS.md` and the
store-submission bundle's recorded screenshot root.

Create a private manual QA checklist before account-side submission:

```powershell
.\scripts\new-browser-extension-manual-qa-report.ps1
```

Use `browser-extension/MANUAL_RELEASE_GATES.md` for the live production-editor,
manual screen-reader, privacy URL, and store-dashboard gate definitions. The
generated report is intentionally written under
`dist\browser-extension-manual-qa\` by default so private manual notes do not
become source-controlled release history.

Publish the static privacy-policy page through the Pages workflow in
`.github/workflows/pages.yml`. Repository settings must use GitHub Actions as
the Pages source before the workflow can produce the public URL.
After deployment, verify the live policy URL with:

```powershell
.\scripts\check-browser-extension-public-privacy-url.ps1 -RequireLive
```

To check the full GitHub Pages readiness path, including repository Pages
configuration, workflow presence on `main`, and live privacy URL readback, run:

```powershell
.\scripts\check-browser-extension-pages-readiness.ps1
```

To summarize the local upload-prep bundle, selected screenshots, manual QA
report template, public privacy URL status, and remaining external blockers,
run:

```powershell
.\scripts\get-browser-extension-release-readiness.ps1
```

Use `-RequireLocalReady` when validating local artifacts only, and
`-RequireStoreReady` after merge, Pages deployment, live-editor QA,
screen-reader review, and store-dashboard preparation are complete.

The public-safe validation summary lives at
`docs/testing/browser-extension-v0.7-validation.md`. Keep detailed VM logs under
ignored `docs/testing/reports/` rather than in the public release branch.

To include packaged VM smokes:

```powershell
.\scripts\validate-browser-extension-release.ps1 -RunVmSmokes -VmName <vm-name> -CredentialPath <credential.xml> -ChromeForTestingZipPath <chrome-for-testing-win64.zip>
```

With `-RunVmSmokes`, the preflight runs packaged Edge Accessibility Tree,
production-editor fixture, store screenshot, Edge keyboard-flow, and Chrome for
Testing keyboard-flow checks.

VM smoke scripts write guest-side artifacts under `C:\Temp\Nahou` by
default. Set `ALFARAHEEDI_VM_QA_ROOT` before running the scripts, or pass
`-QaRoot <guest-path>`, when a QA machine needs a different guest artifact root.

Generate local screenshot candidates from the packaged extension with:

```powershell
.\scripts\capture-browser-extension-store-screenshots.ps1 -VmName <vm-name> -CredentialPath <credential.xml>
```

The script writes PNG screenshots under
`dist\browser-extension-store-assets\<qa-run>\` and returns the copied path as
`LocalScreenshotRoot`.
Use `browser-extension/STORE_ASSETS.md` as the source-controlled screenshot
selection, alt-text, and image-claims checklist before uploading screenshots or
promotional tiles.

Run the packaged keyboard-flow smoke in Edge and Chrome for Testing before
submission:

```powershell
.\scripts\qa-browser-extension-keyboard-flow-smoke.ps1 -VmName <vm-name> -CredentialPath <credential.xml> -Browser Edge
.\scripts\qa-browser-extension-keyboard-flow-smoke.ps1 -VmName <vm-name> -CredentialPath <credential.xml> -Browser ChromeForTesting -ChromeForTestingZipPath <chrome-for-testing-win64.zip>
```

Submission hold points:

- Do not claim live Gmail, WhatsApp Web, Google Docs, or Office integration in
  store copy until those production surfaces have current manual or automated
  evidence.
- Do not submit as public until the manual screen-reader pass is complete or the
  listing explicitly limits accessibility claims to automated checks.
- Do not submit until the privacy policy URL exists and matches the claims in
  this document and `browser-extension/PRIVACY_POLICY.md`.
- Do not submit until the generated screenshots have been manually reviewed
  against current Chrome Web Store and Edge Add-ons listing requirements.
- Do not submit publicly until `browser-extension/MANUAL_RELEASE_GATES.md` has
  current pass/block evidence for live editors, manual screen-reader behavior,
  the public privacy URL, and store dashboard fields.
