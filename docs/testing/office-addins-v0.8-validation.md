# Office Add-ins v0.8 Validation Summary

This is the public-safe validation summary for the Nahou v0.8 Office add-ins
foundation. Detailed manual sideload evidence is intentionally kept out of the
public release branch under `dist\office-addins-manual-qa\` because it can
contain local Office account state, local certificate details, or QA-machine
identifiers.

## Scope

The v0.8 Office add-ins track is a Word and PowerPoint task-pane foundation for
selected text. It connects only to the configured loopback Nahou local API and
does not claim AppSource readiness, live Office underlines, or document-native
range overlays.

## Automated Local Gates

The standard local gate is:

```powershell
.\scripts\validate-office-addins-release.ps1
```

This gate runs the Office add-ins package test, checks manifest host and HTTPS
requirements, validates package and HTTPS host JavaScript syntax, parses release
PowerShell scripts, rebuilds the add-in zip, and verifies the package entries.

## Manual Sideload Gates

The manual gate source is:

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

Use `-RequireCompleted` only when gating a release candidate. A completed report
must match the current gate document hash, contain no TODO placeholders, and
record exactly `Decision: Sideload QA approved`.

## Current Evidence

As of 2026-06-24 local time, source-controlled local gates cover the manifest,
package shape, local HTTPS task-pane host syntax, dev-certificate script syntax,
and package zip entries. Real Word and PowerPoint sideload behavior still needs
manual evidence on the target Windows PC before v0.8 can claim Office sideload
readiness.

## Claim Boundary

Before public release notes broaden Office claims:

- Complete Word selected-text capture and replacement QA.
- Complete PowerPoint selected text-box capture and replacement QA, or document
  the Office limitation clearly.
- Confirm no private Office text appears in logs, reports, screenshots, or
  copied artifacts.
- Confirm task-pane keyboard and high-contrast usability.
- Keep AppSource/store submission, live underlines, and document-native range
  overlays out of v0.8 claims until separate evidence exists.
