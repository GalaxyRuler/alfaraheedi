# Nahou Office Add-ins

This folder starts the v0.8 Word and PowerPoint add-in foundation. It is a
task-pane integration, not a live underline overlay.

## Scope

- `manifest.dev.xml` is the localhost sideload manifest.
- `manifest.prod.xml` is the production HTTPS manifest template with public
  support and privacy URLs.
- `manifest.xml` is the current generated target used by local packaging.
- `taskpane.html` and `src/` provide a compact selected-text review pane.
- The pane reads the current Office selection through Office.js, sends it to the
  local Nahou API, then re-reads the current selection before replacing it with
  deterministic safe fixes.
- The pane only accepts loopback API URLs such as `http://127.0.0.1:3000`.
- Unsupported selections, stale selections, disconnected local API state, and
  no-selection state are shown explicitly. The corrected preview can be copied
  when Office cannot safely replace the selection.

## Local Development Shape

Office add-ins load their task pane from a web URL in the manifest. The
development manifest points at:

```text
https://localhost:3443/office-addins/taskpane.html
```

Create a local development certificate:

```powershell
.\scripts\New-OfficeAddinDevCertificate.ps1
```

Then serve the task pane locally:

```powershell
.\scripts\serve-office-addins.ps1
```

The host serves the source-controlled task pane at:

```text
https://localhost:3443/office-addins/taskpane.html
```

The certificate script can import the public certificate into
`Cert:\CurrentUser\Root` only when called with `-Trust`. Do not use `-Trust`
unless you accept the user certificate store change on that Windows account.
If no PFX password is supplied, the scripts use the non-secret local development
passphrase `nahou-local-dev` for the ignored certificate artifact.
The normal release validator checks script syntax, package shape, localhost
development manifest settings, and production manifest URLs. It does not create
or trust certificates.

## Manual Sideload QA

Manual Word and PowerPoint evidence is tracked by:

```text
office-addins/MANUAL_RELEASE_GATES.md
```

Generate a private report template with:

```powershell
.\scripts\new-office-addins-manual-qa-report.ps1
```

Check the latest private report with:

```powershell
.\scripts\check-office-addins-manual-qa-report.ps1
```

Private reports are written under `dist\office-addins-manual-qa\` by default.
Do not include private document text, account names, tenant names, certificate
passwords, tokens, or private screenshots in those reports.

## WhiteKnight Word QA Harness

Word sideload activation can be probed on the WhiteKnight physical runner with:

```powershell
.\scripts\qa-office-addins-whiteknight-word-sideload.ps1 -AllowBlocked
```

PowerPoint sideload activation can be probed with the same harness through the
PowerPoint wrapper:

```powershell
.\scripts\qa-office-addins-whiteknight-powerpoint-sideload.ps1 -AllowBlocked
```

Use `-StageOnly` to generate the local payload without connecting to
WhiteKnight. The live harness runs the Homelab WhiteKnight readiness and
interactive-desktop gates, stages a disposable Word document or creates a
disposable PowerPoint slide with public-safe Arabic text, imports only the
generated localhost public certificate on WhiteKnight, starts the loopback Nahou
API and HTTPS task-pane host, launches Office through `office-addin-debugging`,
and returns host-specific result JSON plus screenshot/UIA artifacts under
`dist\office-addins-whiteknight-qa\`.

The harness records selected-text evidence as character counts and SHA-256
hashes. It must not be used with private documents, and it does not replace
manual accessibility review or any AppSource submission review.

If an Office host displays an "Add-ins are disabled" task-pane notice, the
harness records the host-specific `*AddinsEnabled` check as failed and stops
before selected-text read/apply actions.

## Sideload Boundary

Microsoft documents that Office add-in manifests describe how an add-in is
loaded by Office, and that sideloading requires placing the manifest in a
catalog or uploading it while the task-pane web application is served from the
`SourceLocation` URL. This foundation follows that split: source-controlled
manifest and task-pane assets plus local HTTPS hosting first, manual Office
sideload QA and store submission later.

## Privacy Boundary

- No telemetry.
- No hosted Nahou service.
- Selected Office text is sent only to the configured loopback Nahou API.
- Raw selected text is not written to logs or source-controlled reports.
- Office.js is loaded from Microsoft's hosted Office Add-ins runtime URL because
  Office task-pane add-ins require that platform runtime.
