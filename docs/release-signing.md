# Nahou v1.0 Release Signing

Nahou v1.0 ships the Windows desktop installer as the primary product path. Browser extension, Office add-in, and CLI artifacts can be attached only when their phase gates are complete and the release notes name them accurately.

## Certificate Option

v1.0 uses Authenticode signing with an OV or EV code-signing certificate exported for CI as a PFX secret. Microsoft Trusted Signing remains a future option if the account, identity validation, and release-channel operations are ready before a later release.

## GitHub Secrets

Required only for signed release artifacts:

- `WINDOWS_SIGNING_PFX_BASE64`: base64-encoded PFX certificate material.
- `WINDOWS_SIGNING_PFX_PASSWORD`: PFX password.
- `WINDOWS_SIGNING_SUBJECT`: expected certificate subject fragment, used as an audit check.

Do not commit certificate files, passwords, private keys, token material, timestamp credentials, or decoded PFX output. The workflow must decode signing material only into the runner temp directory and delete it before the job exits.

## Local Unsigned Dev Build

Developers can build an unsigned installer locally:

```powershell
cd frontend
npm run desktop:build
cd ..
.\scripts\check-desktop-installer-bundle.ps1
```

The expected unsigned output is:

```text
target\release\bundle\nsis\Nahou-<version>-windows-x64-setup.exe
```

Unsigned builds are acceptable for local QA and release-candidate evidence only when clearly labeled as unsigned.

## Signed Release Build

The release workflow builds the same canonical NSIS setup executable, signs it when signing secrets are present, verifies the bundle, emits SHA-256 checksums, and uploads release artifacts from the tag build.

Expected signed installer name:

```text
Nahou-<version>-windows-x64-setup.exe
```

## SmartScreen Expectations

Signing improves Windows trust signals but does not guarantee immediate SmartScreen reputation. New certificates and low-download releases can still show reputation warnings. Release notes must not claim SmartScreen approval unless the downloaded public artifact has been verified.

## Updater Decision

Tauri updater is deferred to v1.1 because updater signing and update endpoint operations need a stable release channel.

The v1.0 desktop app does not include the Tauri updater plugin, update endpoint, or update manifest generation. Users install v1.0 from the GitHub Release installer and upgrade by downloading a later installer.

## WebView2 Runtime

Nahou relies on the Windows WebView2 runtime through Tauri. The v1.0 installer path assumes the Microsoft Edge WebView2 Evergreen Runtime is available or installable through normal Windows servicing. Troubleshooting docs should direct users to install or repair the Evergreen Runtime when the desktop window cannot start.

## References

- Tauri Windows installer docs: https://v2.tauri.app/distribute/windows-installer/
- Tauri Windows code signing docs: https://v2.tauri.app/distribute/sign/windows/
- Tauri updater docs: https://v2.tauri.app/plugin/updater/
- Microsoft WebView2 distribution docs: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution
- Microsoft WebView2 Evergreen guidance: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/evergreen-vs-fixed-version
