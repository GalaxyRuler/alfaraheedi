# Browser Extension Manual Release Gates

These gates define the manual evidence required before Nahou browser
extension v0.7 is submitted as a public Chrome Web Store or Microsoft Edge
Add-ons release. Automated VM smokes are necessary, but they do not replace
live editor, screen-reader, privacy URL, or store-dashboard verification.

Use the local report generator to create a private checklist:

```powershell
.\scripts\new-browser-extension-manual-qa-report.ps1
```

Use the release readiness summary to see which local artifacts and external
store blockers remain:

```powershell
.\scripts\get-browser-extension-release-readiness.ps1
```

The generated report is written under `dist\browser-extension-manual-qa\` by
default. Do not include private emails, chats, document text, account names, or
store dashboard identifiers in the report.

The release readiness script reports `ManualQaReportCompleted: true` only when
the latest private report matches this gate document hash, contains no TODO
placeholders, and records exactly `Decision: Public release approved`. Any other
decision keeps store readiness blocked.

## Gate 1: Fresh Automated Release Preflight

Required before manual testing:

```powershell
.\scripts\validate-browser-extension-release.ps1 -RunVmSmokes -VmName <vm-name> -CredentialPath <credential.xml> -ChromeForTestingZipPath <chrome-for-testing-win64.zip>
```

Pass criteria:

- Package tests pass.
- Package zip is rebuilt and zip entries match the expected runtime files.
- Store asset manifest and public privacy page source checks pass.
- Packaged Edge Accessibility Tree smoke passes.
- Packaged production-editor fixture smoke passes.
- Packaged store screenshots are regenerated or an older screenshot run is
  explicitly retained.
- Packaged keyboard-flow smoke passes in Edge.
- Packaged keyboard-flow smoke passes in Chrome for Testing.

## Gate 2: Public Privacy URL

Required before store upload:

```powershell
.\scripts\check-browser-extension-pages-readiness.ps1 -RequireReady
```

Pass criteria:

- GitHub Pages is configured for the repository.
- `.github/workflows/pages.yml` exists on `main`.
- The live privacy URL returns success.
- The live privacy page contains the required browser-extension privacy claims.
- Store dashboard privacy answers match `browser-extension/PRIVACY_POLICY.md`.

## Gate 3: Live Production Editors

Do not use private accounts or private text for this gate. Use disposable test
content such as `helo wat you are do?` and clear it immediately after testing.

Required minimum matrix:

| Surface | Minimum check | Public claim allowed after pass |
| --- | --- | --- |
| Normal browser textarea | Suggestions appear, Apply updates the intended text, pause stops checks. | Generic editable web fields. |
| Gmail compose | Panel appears only for the editable compose text, quoted/signature/private surrounding text is not analyzed, Apply updates the intended compose text. | Gmail compatibility only if current evidence passes. |
| WhatsApp Web composer | Panel appears for the composed message, paragraph/newline mapping is correct, Apply updates the intended message without sending it. | WhatsApp Web compatibility only if current evidence passes. |
| Google Docs | Either supported behavior is verified, or limitation is documented without claims. | Google Docs compatibility only if current evidence passes. |
| At least one browser field inside an iframe, when available | Suggestions and Apply work in the iframe editor, or limitation is documented. | Iframe-hosted editor compatibility if current evidence passes. |

Pass criteria:

- No raw live editor text appears in logs, reports, screenshots, or copied
  artifacts.
- Sensitive-looking fields are skipped.
- Suggestions are anchored to the intended visible text.
- Apply fails closed if the text changed before the user accepts a suggestion.
- The toolbar pause control stops analysis requests while paused.
- Any unsupported editor is recorded as a limitation, not hidden.

## Gate 4: Manual Screen-Reader And Keyboard Review

Automated axe, Accessibility Tree, contrast, and keyboard smokes are regression
guards. A public release still needs manual assistive-technology review.

Required minimum matrix:

| Surface | Minimum check |
| --- | --- |
| Options page | Heading, API URL textbox, writing-mode select, enabled switch, Save button, and validation/status messages have understandable names and reading order. |
| Toolbar popup | Status, pause/resume control, settings button, and API health action are reachable and understandable from the keyboard. |
| Injected suggestion panel | The panel announces as a review region, suggestion source/replacement text is understandable, Apply buttons have replacement-specific names, Escape dismisses the panel, and focus is not trapped. |
| High contrast mode | Text, focus indicators, panel borders, buttons, and highlights remain perceivable. |

Recommended readers:

- Windows Narrator for the minimum Windows pass.
- NVDA when available, especially before broad public release.

Pass criteria:

- All interactive controls are reachable by keyboard.
- Focus order matches the visual/task order.
- Status messages are announced or discoverable.
- There is no keyboard trap.
- Any screen-reader limitation is documented before public release claims are
  broadened.

## Gate 5: Store Dashboard Review

Required before pressing submit:

- Upload the zip from the latest exported store-submission bundle.
- Use the listing copy and permission justifications from
  `browser-extension/STORE_SUBMISSION.md`.
- Use the privacy policy URL that passed Gate 2.
- Upload only screenshots listed in `browser-extension/STORE_ASSETS.md`, after
  manual visual review.
- Keep the first Edge submission `Hidden` unless the user explicitly chooses a
  public listing after all gates pass.
- Do not claim live Gmail, WhatsApp Web, Google Docs, Word, PowerPoint, or
  always-on Grammarly-style overlays unless that exact surface has current
  evidence.

Pass criteria:

- Dashboard fields do not exceed source-controlled claims.
- Dashboard privacy answers match the policy.
- Screenshots contain no private text or account data.
- Reviewer notes explain the loopback-only local API requirement.
- Store review result is recorded when available.

## Release Decision

Public release is blocked if any of these are true:

- The live privacy URL is not reachable.
- Store dashboard privacy answers differ from the privacy policy.
- The package uses non-loopback API hosts, remote code, telemetry, or broad
  permissions.
- Manual live-editor testing finds a high-risk apply/anchoring bug.
- Manual screen-reader testing finds a keyboard trap or unusable core flow.
- Store listing copy implies unsupported production editors or OS-wide live
  underline behavior.

Hidden/private store submission is allowed only when the listing explicitly
limits claims to verified generic web-field behavior and the user accepts any
remaining manual-test limitations.
