param(
    [string]$OutDir = "dist\browser-extension-manual-qa",

    [string]$Version = "",

    [string]$RunLabel = ""
)

$ErrorActionPreference = "Stop"

function Resolve-RepoPath {
    param([Parameter(Mandatory = $true)] [string]$Path)
    if ([IO.Path]::IsPathRooted($Path)) {
        return $Path
    }
    return Join-Path $script:RepoRoot $Path
}

function Assert-PathUnderRepo {
    param(
        [Parameter(Mandatory = $true)] [string]$Path,
        [Parameter(Mandatory = $true)] [string]$Description
    )

    $fullPath = [IO.Path]::GetFullPath($Path)
    $repoRootPath = [IO.Path]::GetFullPath($script:RepoRoot)
    if (-not $fullPath.StartsWith($repoRootPath, [StringComparison]::OrdinalIgnoreCase)) {
        throw "$Description must stay under repository root. Path=$fullPath RepoRoot=$repoRootPath"
    }

    return $fullPath
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$manifestPath = Join-Path $RepoRoot "browser-extension\manifest.json"
$gateDocPath = Join-Path $RepoRoot "browser-extension\MANUAL_RELEASE_GATES.md"
if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "Browser extension manifest not found: $manifestPath"
}
if (-not (Test-Path -LiteralPath $gateDocPath)) {
    throw "Manual release gate document not found: $gateDocPath"
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if (-not $Version) {
    $Version = [string]$manifest.version
}
$gateDocHash = (Get-FileHash -LiteralPath $gateDocPath -Algorithm SHA256).Hash

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$safeRunLabel = if ($RunLabel) {
    $RunLabel -replace '[^A-Za-z0-9._-]', '-'
} else {
    "v$Version"
}

$outputRoot = Assert-PathUnderRepo (Resolve-RepoPath $OutDir) "Manual QA report output root"
New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

$reportPath = Join-Path $outputRoot "nahou-browser-extension-$safeRunLabel-manual-qa-$timestamp.md"

@"
# Nahou Browser Extension Manual QA Report

Version: $Version
Run label: $safeRunLabel
Date: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz")
Gate source: browser-extension/MANUAL_RELEASE_GATES.md
Gate source SHA256: $gateDocHash

Do not include private emails, chats, document text, account names, tokens,
store dashboard identifiers, or screenshots with private data in this report.

## Gate 1: Fresh Automated Release Preflight

Command:

```powershell
.\scripts\validate-browser-extension-release.ps1 -RunVmSmokes -VmName <vm-name> -CredentialPath <credential.xml> -ChromeForTestingZipPath <chrome-for-testing-win64.zip>
```

Result: TODO Pass / Fail / Blocked
Evidence root or output summary: TODO

## Gate 2: Public Privacy URL

Command:

```powershell
.\scripts\check-browser-extension-pages-readiness.ps1 -RequireReady
```

Result: TODO Pass / Fail / Blocked
Live URL: TODO

## Gate 3: Live Production Editors

Use disposable public-safe text only, for example `helo wat you are do?`.

## Controlled Fixture Coverage

Record whether automated or WhiteKnight-assisted fixture evidence exists for
each local-ready browser claim. Use public-safe fixture names only.

| Surface | Result | Evidence summary | Limitation or follow-up |
| --- | --- | --- | --- |
| textarea | TODO | TODO | TODO |
| text-input | TODO | TODO | TODO |
| simple-contenteditable | TODO | TODO | TODO |
| shadow-dom | TODO | TODO | TODO |
| iframe | TODO | TODO | TODO |
| repeated-text | TODO | TODO | TODO |
| RTL/mixed text | TODO | TODO | TODO |
| large text refusal | TODO | TODO | TODO |
| sensitive fields | TODO | TODO | TODO |
| API unavailable | TODO | TODO | TODO |
| paused/site-disabled | TODO | TODO | TODO |
| keyboard-only card flow | TODO | TODO | TODO |
| accessibility scan | TODO | TODO | TODO |

## Real-Site Manual Coverage

| Surface | Result | Evidence summary | Limitation or follow-up |
| --- | --- | --- | --- |
| Normal browser textarea | TODO | TODO | TODO |
| Gmail compose | TODO | TODO | TODO |
| WhatsApp Web composer | TODO | TODO | TODO |
| Google Docs | TODO | TODO | TODO |
| Plain contenteditable site | TODO | TODO | TODO |
| Framework-heavy editor | TODO | TODO | TODO |
| Iframe editor, when available | TODO | TODO | TODO |

Privacy check: TODO confirm no raw private text was recorded.

## WhiteKnight Evidence

Use WhiteKnight for physical browser, foreground, or screenshot evidence when
VM evidence is not sufficient. Store detailed artifacts only in ignored private
locations such as `docs\testing\reports\` or `dist\browser-extension-manual-qa\`.

WhiteKnight used: TODO Yes / No / Not needed
WhiteKnight evidence root: TODO
Public-safe artifact check: TODO Pass / Fail

## Gate 4: Manual Screen-Reader And Keyboard Review

Reader/browser used: TODO

| Surface | Result | Evidence summary | Limitation or follow-up |
| --- | --- | --- | --- |
| Options page | TODO | TODO | TODO |
| Toolbar popup | TODO | TODO | TODO |
| Injected suggestion panel | TODO | TODO | TODO |
| High contrast mode | TODO | TODO | TODO |

Keyboard trap check: TODO Pass / Fail

## Gate 5: Store Dashboard Review

| Item | Result | Notes |
| --- | --- | --- |
| Upload zip from latest export bundle | TODO | TODO |
| Privacy policy URL from Gate 2 | TODO | TODO |
| Listing copy matches STORE_SUBMISSION.md | TODO | TODO |
| Permission justifications match STORE_SUBMISSION.md | TODO | TODO |
| Screenshots match STORE_ASSETS.md and contain no private data | TODO | TODO |
| Reviewer notes explain loopback-only local API | TODO | TODO |
| Chrome Web Store review result | TODO | TODO |
| Edge Add-ons review result | TODO | TODO |

## Release Decision

Decision: TODO Public release approved / Hidden submission only / Blocked

Blocking issues:

- TODO

Follow-up issues:

- TODO
"@ | Set-Content -LiteralPath $reportPath -Encoding UTF8

[pscustomobject]@{
    Version = $Version
    Report = $reportPath
    GateSource = $gateDocPath
    GateSourceSha256 = $gateDocHash
    PrivacyReminder = "Do not include private text, account data, tokens, or private screenshots."
} | ConvertTo-Json -Depth 4
