# Browser Extension Store Assets

This file tracks the screenshot set and listing-asset rules for the V2A
browser-extension release candidate. It is intentionally source-controlled
metadata, not the generated PNG binaries.

## Current Screenshot Set

Generate or refresh the screenshot candidates with:

```powershell
.\scripts\capture-browser-extension-store-screenshots.ps1 -VmName <vm-name> -CredentialPath <credential.xml>
```

The script writes the selected PNG filenames under
`dist\browser-extension-store-assets\<qa-run>\` and verifies each image is a
valid `1280x800` PNG before reporting success.

The VM guest-side working directory defaults to `C:\Temp\Nahou`. Set
`ALFARAHEEDI_VM_QA_ROOT` or pass `-QaRoot <guest-path>` if the QA VM needs a
different guest artifact root.

Use the latest passing run unless a later run is manually rejected for visual
quality. An earlier verified VM preflight in this branch produced screenshot
candidates at:

```text
dist\browser-extension-store-assets\v0.7-extension-store-screenshots-20260622-134718
```

Latest full VM release preflight screenshot candidates:

```text
dist\browser-extension-store-assets\v0.7-extension-store-screenshots-20260623-030207
```

Selected screenshot root:
dist\browser-extension-store-assets\v0.7-extension-store-screenshots-20260623-030207

Selected screenshots:

| File | Required size | Store-facing purpose | Alt text |
| --- | --- | --- | --- |
| `01-options-settings.png` | `1280x800` | Shows loopback API and writing-mode settings. | Nahou extension options showing local API URL, writing mode, and enabled checking controls. |
| `02-popup-status.png` | `1280x800` | Shows toolbar popup status and pause/settings controls. | Nahou toolbar popup showing local API status, checking status, pause control, and settings button. |
| `03-web-field-suggestions.png` | `1280x800` | Shows suggestions beside a normal editable web field. | Nahou suggestions panel beside a web textarea with local writing corrections. |

## Listing Image Rules

- Do not imply live Gmail, WhatsApp Web, Google Docs, Word, or PowerPoint
  integration in screenshots, captions, promotional tiles, or listing copy
  until that exact production surface has current verification.
- Do not show private user text, account data, chat names, emails, contacts, or
  external website content in listing imagery.
- Keep the screenshots focused on the generic web-field foundation:
  settings, toolbar status, and a simple web textarea suggestion panel.
- Review generated images manually before upload for cropped text, scrollbars,
  overlap, blurry UI, stale dates, or claims that exceed `STORE_SUBMISSION.md`.
- If promotional tiles are created later, they must follow the same claims
  boundary as the selected screenshots.

## Manual Store Upload Checklist

- Publish `PRIVACY_POLICY.md` at a stable public URL before upload. This repo
  prepares `docs/public/browser-extension/privacy.html` for GitHub Pages; do
  not use the expected Pages URL until the workflow has deployed successfully.
- Paste the store copy and permission justifications from
  `STORE_SUBMISSION.md`.
- Upload the three selected screenshots above, or regenerate and update this
  file if replacing them.
- Confirm the dashboard privacy answers still match `PRIVACY_POLICY.md`.
- Keep first Edge submission hidden/private unless live-editor and manual
  accessibility checks have been completed.
- Complete `MANUAL_RELEASE_GATES.md` before public submission; screenshots and
  captions must stay inside the same claims boundary as the manual gate result.
