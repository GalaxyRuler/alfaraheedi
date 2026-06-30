# Office Add-ins Manual Sideload Gates

These gates define the manual evidence required before Nahou v0.8 can claim
Word and PowerPoint sideload support. Automated package validation is necessary,
but it does not prove that Office can load the local task pane or that selected
text capture and replacement work inside real Office documents.

Use the local report generator to create a private checklist:

```powershell
.\scripts\new-office-addins-manual-qa-report.ps1
```

The generated report is written under `dist\office-addins-manual-qa\` by
default. Do not include private documents, account names, tenant names, meeting
content, emails, tokens, certificate passwords, or screenshots with private
data in the report.

The checker reports `Completed: true` only when the latest private report
matches this gate document hash, contains no TODO placeholders, and records
exactly `Decision: Sideload QA approved`. Any other decision keeps v0.8 Office
sideload readiness blocked.

## Gate 1: Fresh Local Preflight

Required before manual testing:

```powershell
.\scripts\validate-office-addins-release.ps1
```

Pass criteria:

- Package tests pass.
- Manifest targets Word and PowerPoint.
- Development manifest uses `https://localhost:3443/office-addins/taskpane.html`.
- Production manifest contains public HTTPS support, privacy, icon, and task-pane
  URLs and no localhost URLs.
- Package zip is rebuilt and zip entries match the expected runtime files.
- Release PowerShell scripts parse successfully.
- The HTTPS task-pane host script parses successfully.

## Gate 2: Local HTTPS Task-Pane Host

Required before sideloading:

```powershell
.\scripts\New-OfficeAddinDevCertificate.ps1
.\scripts\serve-office-addins.ps1
```

Use `-Trust` only when you accept a CurrentUser trusted root store change on
that Windows account. Record whether the certificate was trusted manually, and
do not record certificate passwords.

Pass criteria:

- `https://localhost:3443/office-addins/taskpane.html` opens locally.
- Office.js is requested from Microsoft's hosted Office runtime URL.
- No hosted Nahou API, telemetry endpoint, or non-loopback writing service is
  configured.
- The local Nahou API is running separately when the task pane is tested.

## Gate 3: Word Sideload Flow

Use a disposable document and public-safe text only. A useful deterministic
Arabic spacing sample is:

```text
كيف حال  ما اخبار
```

The WhiteKnight Word harness can collect repeatable evidence for this gate:

```powershell
.\scripts\qa-office-addins-whiteknight-word-sideload.ps1 -AllowBlocked
```

Use `-StageOnly` when validating the payload shape without opening Word. Live
WhiteKnight artifacts must record counts, hashes, screenshots, UIA snapshots,
and pass/fail checks only; do not use private document text.

Pass criteria:

- Word loads the manifest and opens the Nahou task pane.
- Check Selection reads only the selected document text.
- Suggestions or safe fixes are shown for the selected text when the local API
  returns them.
- Apply Safe Fixes re-reads the selection and updates the selected Word text only
  when it still matches the checked text.
- If the selection changed, the pane shows a stale-selection state and offers
  the copy corrected text fallback.
- No private document text appears in logs, reports, screenshots, or copied
  artifacts.
- Unsupported or flaky behavior is recorded as a limitation.

## Gate 4: PowerPoint Sideload Flow

Use a disposable presentation and public-safe text only.

The WhiteKnight PowerPoint harness can collect repeatable evidence for this
gate:

```powershell
.\scripts\qa-office-addins-whiteknight-powerpoint-sideload.ps1 -AllowBlocked
```

Use `-StageOnly` when validating the payload shape without opening PowerPoint.
Live WhiteKnight artifacts must record counts, hashes, screenshots, UIA
snapshots, and pass/fail checks only; do not use private slide text.
If the host reports that add-ins are disabled, record the
`PowerPointAddinsEnabled=false` evidence as an Office host/license blocker.

Pass criteria:

- PowerPoint loads the manifest and opens the Nahou task pane.
- Check Selection reads selected text from a text box when Office exposes it as
  `Office.CoercionType.Text`.
- Apply Safe Fixes re-reads the selection and updates the intended text box
  selection only when it still matches the checked text, or the Office limitation
  is documented clearly.
- If the selected PowerPoint content is unsupported, the pane shows the
  unsupported-selection state and offers the copy corrected text fallback.
- No private slide content appears in logs, reports, screenshots, or copied
  artifacts.

## Gate 5: Accessibility And Keyboard Smoke

Pass criteria:

- Task-pane controls are reachable with keyboard navigation.
- The host label, API URL field, writing mode selector, Check Selection button,
  Apply Safe Fixes button, Copy Corrected Text button, corrected preview,
  suggestions list, and status message have understandable names and reading
  order.
- Focus is not trapped in the task pane.
- High contrast mode keeps text, focus indicators, borders, buttons, and status
  messages perceivable.

## Release Decision

Sideload readiness is blocked if any of these are true:

- The task-pane URL cannot be loaded over HTTPS.
- Word cannot load the manifest.
- Word selected-text replacement targets the wrong text.
- PowerPoint behavior is claimed without current evidence or a documented
  limitation.
- Manual testing finds a privacy issue, raw private-text leak, or keyboard trap.
- Documentation implies AppSource/store readiness or live Grammarly-style
  underlines in Office.
