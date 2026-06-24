param(
    [string]$OutDir = "dist\office-addins-manual-qa",

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
$manifestPath = Join-Path $RepoRoot "office-addins\manifest.xml"
$gateDocPath = Join-Path $RepoRoot "office-addins\MANUAL_RELEASE_GATES.md"
if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "Office add-in manifest not found: $manifestPath"
}
if (-not (Test-Path -LiteralPath $gateDocPath)) {
    throw "Office add-ins manual release gate document not found: $gateDocPath"
}

$manifestXml = [xml](Get-Content -LiteralPath $manifestPath -Raw)
if (-not $Version) {
    $Version = [string]$manifestXml.OfficeApp.Version
}
$gateDocHash = (Get-FileHash -LiteralPath $gateDocPath -Algorithm SHA256).Hash

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$safeRunLabel = if ($RunLabel) {
    $RunLabel -replace '[^A-Za-z0-9._-]', '-'
} else {
    "v$Version"
}

$outputRoot = Assert-PathUnderRepo (Resolve-RepoPath $OutDir) "Office add-ins manual QA report output root"
New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

$reportPath = Join-Path $outputRoot "nahou-office-addins-$safeRunLabel-manual-qa-$timestamp.md"

@"
# Nahou Office Add-ins Manual QA Report

Version: $Version
Run label: $safeRunLabel
Date: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz")
Gate source: office-addins/MANUAL_RELEASE_GATES.md
Gate source SHA256: $gateDocHash

Do not include private documents, account names, tenant names, meeting content,
emails, tokens, certificate passwords, or screenshots with private data in this
report.

## Gate 1: Fresh Local Preflight

Command:

```powershell
.\scripts\validate-office-addins-release.ps1
```

Result: TODO Pass / Fail / Blocked
Output summary: TODO
Package path: TODO

## Gate 2: Local HTTPS Task-Pane Host

Certificate command:

```powershell
.\scripts\New-OfficeAddinDevCertificate.ps1
```

Host command:

```powershell
.\scripts\serve-office-addins.ps1
```

Task-pane URL: https://localhost:3443/office-addins/taskpane.html
Certificate trusted with -Trust: TODO Yes / No
Task-pane URL result: TODO Pass / Fail / Blocked
Local API status: TODO Running / Not running / Blocked
Privacy check: TODO confirm no hosted Nahou API, telemetry endpoint, or non-loopback writing service was configured.

## Gate 3: Word Sideload Flow

Disposable document only. Suggested public-safe sample:

```text
كيف حال  ما اخبار
```

| Check | Result | Evidence summary | Limitation or follow-up |
| --- | --- | --- | --- |
| Manifest sideloads in Word | TODO | TODO | TODO |
| Task pane opens | TODO | TODO | TODO |
| Check Selection reads selected text only | TODO | TODO | TODO |
| Suggestions or safe fixes appear | TODO | TODO | TODO |
| Apply Safe Fixes updates intended selection only | TODO | TODO | TODO |
| Stale selection blocks replacement and offers copy fallback | TODO | TODO | TODO |
| No private text captured in report/logs/screenshots | TODO | TODO | TODO |

## Gate 4: PowerPoint Sideload Flow

Disposable presentation only.

| Check | Result | Evidence summary | Limitation or follow-up |
| --- | --- | --- | --- |
| Manifest sideloads in PowerPoint | TODO | TODO | TODO |
| Task pane opens | TODO | TODO | TODO |
| Check Selection reads selected text box text | TODO | TODO | TODO |
| Suggestions or safe fixes appear | TODO | TODO | TODO |
| Apply Safe Fixes updates intended text box selection only | TODO | TODO | TODO |
| Unsupported selection offers copy corrected text fallback | TODO | TODO | TODO |
| No private slide content captured in report/logs/screenshots | TODO | TODO | TODO |

## Gate 5: Accessibility And Keyboard Smoke

Reader/browser used, if any: TODO

| Surface | Result | Evidence summary | Limitation or follow-up |
| --- | --- | --- | --- |
| Keyboard reaches all task-pane controls including Copy Corrected Text | TODO | TODO | TODO |
| Focus order matches task order | TODO | TODO | TODO |
| Status message is readable or announced | TODO | TODO | TODO |
| No keyboard trap | TODO | TODO | TODO |
| High contrast mode remains perceivable | TODO | TODO | TODO |

## Release Decision

Decision: TODO Sideload QA approved / Hidden sideload only / Blocked

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
    PrivacyReminder = "Do not include private documents, account data, certificate passwords, tokens, or private screenshots."
} | ConvertTo-Json -Depth 4
