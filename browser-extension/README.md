# Nahou Browser Extension

This is the v0.7 browser-extension foundation for live web-editor assistance.

## Current Scope

- Chrome Manifest V3 unpacked extension.
- Manifest-declared PNG icons for install and extension-management surfaces.
- Toolbar action popup that shows the saved local API URL, writing mode, enabled/paused state, current-site state, and `/v1/health` reachability, with a direct settings button.
- Pause/resume control from the toolbar popup and options page.
- Disable/re-enable control for the current site from the toolbar popup.
- Content script detects focused editable `textarea`, safe text-like `input` types (`text`, `search`, `email`, `url`, and `tel`), and contenteditable fields using `true`, empty, or `plaintext-only` tokens.
- Read-only/disabled native controls and ARIA read-only/disabled editable controls are ignored before text is analyzed.
- Read-only, disabled, password, hidden, sensitive-hinted, oversized, unsupported complex rich-editor, and other non-text-like textarea/input controls are ignored, sensitive-hinted contenteditable roots are ignored, and editors inside sensitive-hinted forms, fieldsets, groups, or regions are ignored.
- The content script is injected into matching frames so iframe-hosted editable fields can be handled.
- Editable fields inside open shadow roots are detected through composed browser event paths.
- Closed shadow roots and composed-path boundaries that do not expose an editable target are classified as unsupported.
- Text is debounced and sent through the extension service worker to the configured local Nahou HTTP API only when checking is enabled for the current site.
- Extension options store the loopback API URL, default writing mode, enabled state, and disabled-site hosts in `chrome.storage.local`, with a reset control for packaged defaults.
- The service worker uses the stored loopback API URL and writing mode for analysis requests; content-script messages cannot override those settings.
- The service worker rejects blank, malformed, and oversized analysis messages before reading settings or calling the local API.
- Suggestions render in a small page-local panel near the editor, clamped inside the viewport for right-edge, bottom-edge, or narrow-window editors.
- The suggestion panel exposes region semantics, gives Apply buttons unique replacement-specific accessible labels, sets `dir="auto"` on panel/source/replacement text for mixed Arabic/English suggestions, remains usable when keyboard focus moves from the editor into the panel, and can be dismissed with Escape.
- The injected panel, toolbar popup, and options page keep WCAG AA text contrast in the default theme and include Windows forced-colors fallbacks.
- Suggestions that cannot be mapped to the current editor text remain visible for review but do not get Apply controls.
- Analysis waits until browser IME/composition input ends before sending active editor text.
- Delayed API responses are ignored if the editor text has changed since the request was sent.
- Plain textarea and input fields get scroll- and layout-synchronized non-mutating wavy underline overlays for anchored suggestions.
- Contenteditable fields get non-mutating browser-native CSS Highlight marks when the browser supports the CSS Highlight API.
- Individual suggestions can be applied when the current editor text resolves to a trusted UTF-16 span or one unambiguous original-text occurrence.
- Plain textarea/input replacements prefer validated suggestion spans, so repeated original text applies to the clicked occurrence; repeated originals without a trusted span remain review-only.
- Accepted replacements place the caret after the inserted text and dispatch a composed `InputEvent` with `inputType="insertReplacementText"` and replacement `data`, so page frameworks and open Shadow DOM hosts can observe applied edits.
- Projection covers UTF-16 spans, emoji-adjacent spans, Arabic/Latin mixed text, RTL text, line breaks, block boundaries, hidden decoration, non-editable islands, and known editor sentinels when a stable range can be built.
- Ambiguous or DOM-unavailable projections return review-only/unavailable runtime results and do not create applyable DOM ranges.
- Runtime analyze requests preserve the editor text exactly, including leading or trailing whitespace, so API spans remain aligned with the field.
- Oversized editor text is refused locally with a status message before it is sent through the extension runtime or local API.
- Suggestion panels and underline marks are cleared immediately after a successful apply, editor text change, focus loss, or editor removal.
- Contenteditable `<br>`, repeated `<br>`, empty-block, and common block-element line breaks are serialized as newlines for analysis and offset mapping.
- Non-editable rich-editor islands such as `contenteditable="false"` chips, hidden or `aria-hidden="true"` decoration nodes, and known invisible rich-editor sentinel nodes such as Slate zero-width spans and ProseMirror trailing breaks are omitted from analysis text and offset mapping.
- Anchored contenteditable replacements use DOM ranges so simple inline markup is preserved when applying a suggestion.
- The extension does not auto-apply suggestions, send text to hosted services, or use telemetry.

Production-editor-specific anchoring for apps such as Gmail, WhatsApp Web, and Google Docs is intentionally later v0.7 work. This slice proves editor discovery, localhost analysis, safe page UI injection, matching-frame injection for iframe-hosted editors, non-mutating underline marks for textarea and safe text-like input fields, CSS Highlight marks for simple contenteditable fields, open Shadow DOM editor event handling, and guarded replacement for editable text without flattening simple inline markup or collapsing simple contenteditable line breaks, including blank lines represented by empty blocks or repeated `<br>` nodes. Read-only/disabled text controls, ARIA read-only/disabled editable controls, password inputs, sensitive-hinted editable controls or ancestor containers such as OTP, credit-card, token, API-key, and secret fields, other non-text-like controls, oversized text, closed shadow roots, unsupported complex rich-editor islands, `contenteditable="false"` islands, hidden decoration nodes, and known invisible rich-editor sentinel nodes inside an editable root are ignored.

## Run Locally

Start the local API:

```powershell
cargo run -p write-cli -- serve
```

Load the extension:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click `Load unpacked`.
4. Choose this repository's `browser-extension` folder.

The service worker calls only HTTP loopback API URLs declared in `manifest.json`.
The toolbar popup also checks the configured loopback `/v1/health` endpoint without sending editor text.

## Settings

Open the extension options page to set:

- Local API URL, for example `http://127.0.0.1:3000` or `http://127.0.0.1:3402`.
- Writing mode: Auto, Arabic, English, or Mixed.
- Check editable fields: on or paused.
- Disabled sites: hostnames where checking is off until re-enabled.
- Reset: restore the packaged default loopback URL, writing mode, enabled state, and empty disabled-site list.

Remote API URLs and local URLs outside the manifest host permissions are
rejected on save and are not persisted. If invalid stored settings are
encountered, they normalize back to the default loopback API URL. The extension
content script checks the saved enabled state and disabled-site list before
sending editor text to the extension runtime, while the service worker repeats
the same checks before calling the local API. The package requests only the
`storage` permission plus HTTP loopback host permissions for the local API
bridge.

## Package

Build a clean extension zip from the repository root:

```powershell
.\scripts\package-browser-extension.ps1
```

The package is written to `dist\browser-extension\nahou-browser-extension-0.7.0.zip`.
The packaging helper validates the MV3 manifest, keeps API host permissions loopback-only, rejects optional permissions, rejects external-connection or web-accessible-resource expansion, requires matching-frame injection for iframe editors, verifies the manifest-declared PNG icons and toolbar action, and includes only runtime extension files, icons, and required static imports.
`src/editorSurface.js` is a source/test helper for focused DOM behavior coverage; it is intentionally excluded from the upload zip because the packaged content script is self-contained.
Store-submission notes live in `STORE_SUBMISSION.md`; they document the single purpose, permission justifications, privacy claims, and still-manual review items.

Run the local release preflight before preparing store uploads:

```powershell
.\scripts\validate-browser-extension-release.ps1
```

To include packaged VM smokes in the same preflight:

```powershell
.\scripts\validate-browser-extension-release.ps1 -RunVmSmokes -VmName <vm-name> -CredentialPath <credential.xml> -ChromeForTestingZipPath <chrome-for-testing-win64.zip>
```

With `-RunVmSmokes`, the preflight runs the packaged Edge Accessibility Tree
smoke, production-editor fixture smoke, store screenshot capture, Edge
keyboard-flow smoke, and Chrome for Testing keyboard-flow smoke.

VM smoke scripts write guest-side artifacts under `C:\Temp\Nahou` by
default. Set `ALFARAHEEDI_VM_QA_ROOT` before running the scripts, or pass
`-QaRoot <guest-path>`, when a QA machine needs a different guest artifact root.

Run the packaged Edge Accessibility Tree smoke against a prepared Windows QA VM:

```powershell
.\scripts\qa-browser-extension-ax-smoke.ps1 -VmName <vm-name> -CredentialPath <credential.xml>
```

Run the packaged Edge production-editor fixture smoke against a prepared Windows
QA VM:

```powershell
.\scripts\qa-browser-extension-production-editors-smoke.ps1 -VmName <vm-name> -CredentialPath <credential.xml>
```

Run the packaged Edge keyboard-flow smoke against a prepared Windows QA VM:

```powershell
.\scripts\qa-browser-extension-keyboard-flow-smoke.ps1 -VmName <vm-name> -CredentialPath <credential.xml>
```

The same smoke can run against Chrome for Testing without installing Chrome in
the VM. If the VM cannot reach the Chrome for Testing metadata endpoint, download
the win64 Chrome for Testing zip on the host and pass it in:

```powershell
.\scripts\qa-browser-extension-keyboard-flow-smoke.ps1 -VmName <vm-name> -CredentialPath <credential.xml> -Browser ChromeForTesting -ChromeForTestingZipPath <chrome-for-testing-win64.zip>
```

The script also has an `InstalledChrome` diagnostic mode for QA machines with
Google Chrome installed. Keep Chrome for Testing as the repeatable Chrome-family
release gate unless a future VM proves installed Chrome loading cleanly.

Generate local store-listing screenshot candidates from the packaged extension:

```powershell
.\scripts\capture-browser-extension-store-screenshots.ps1 -VmName <vm-name> -CredentialPath <credential.xml>
```

The script writes PNG screenshots under
`dist\browser-extension-store-assets\<qa-run>\` and returns the copied path as
`LocalScreenshotRoot`. Select the reviewed run in `STORE_ASSETS.md` before
exporting store-submission artifacts.

## Store-Readiness Boundary

This foundation is packaged like a browser extension, but it is not yet submitted to Chrome Web Store or Edge Add-ons. Before submission, keep these checks green:

- The manifest requests only `storage`.
- API host permissions stay limited to HTTP loopback URLs.
- Content scripts run only on `http://*/*` and `https://*/*` pages, at `document_idle`, with `all_frames: true`.
- Runtime source stays free of text logging, telemetry primitives, and hosted analytics calls.
- Runtime source stays free of remote-code execution primitives such as `eval`, `new Function`, `importScripts`, and remote script imports.
- Manifest listing fields keep bounded `name`, `short_name`, and `description` values for store surfaces.
- Extension UI keeps explicit backgrounds, AA contrast, and Windows forced-colors fallbacks.
- The package zip contains only runtime files needed by the manifest, popup, options page, and static imports.

Live production-editor-specific behavior for Gmail, WhatsApp Web, Google Docs, and similar editors still needs separate QA before store submission. Packaged synthetic Gmail/WhatsApp-style fixture coverage is available through the VM production-editor smoke.
