# Alfaraheedi Office Add-ins

This folder starts the v0.8 Word and PowerPoint add-in foundation. It is a
task-pane integration, not a live underline overlay.

## Scope

- `manifest.xml` is an add-in-only XML manifest for Word and PowerPoint.
- `taskpane.html` and `src/` provide a compact selected-text review pane.
- The pane reads the current Office selection through Office.js, sends it to the
  local Alfaraheedi API, and can replace the selected Office text with
  deterministic safe fixes.
- The pane only accepts loopback API URLs such as `http://127.0.0.1:3000`.

## Local Development Shape

Office add-ins load their task pane from a web URL in the manifest. The
foundation manifest points at:

```text
https://localhost:3443/office-addins/taskpane.html
```

That HTTPS task-pane host is intentionally not implemented in this first v0.8
slice. The next slice should add a local HTTPS static host or dev certificate
workflow before manual sideload QA.

## Sideload Boundary

Microsoft documents that Office add-in manifests describe how an add-in is
loaded by Office, and that sideloading requires placing the manifest in a
catalog or uploading it while the task-pane web application is served from the
`SourceLocation` URL. This foundation follows that split: source-controlled
manifest and task-pane assets first, runtime hosting and store submission later.

## Privacy Boundary

- No telemetry.
- No hosted Alfaraheedi service.
- Selected Office text is sent only to the configured loopback Alfaraheedi API.
- Raw selected text is not written to logs or source-controlled reports.
- Office.js is loaded from Microsoft's hosted Office Add-ins runtime URL because
  Office task-pane add-ins require that platform runtime.
