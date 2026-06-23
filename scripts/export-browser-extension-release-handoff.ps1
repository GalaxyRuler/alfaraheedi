param(
    [string]$OutDir = "dist\browser-extension-release-handoff",

    [switch]$RunVmSmokes,

    [string]$VmName = "",

    [string]$CredentialPath = "",

    [string]$ChromeForTestingZipPath = "",

    [switch]$SkipPackageTests,

    [switch]$RequireStoreReady
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

function ConvertFrom-CommandJson {
    param(
        [Parameter(Mandatory = $true)] [object[]]$CommandOutput,
        [Parameter(Mandatory = $true)] [string]$StepName
    )

    $outputText = ($CommandOutput | Out-String).Trim()
    if (-not $outputText) {
        throw "$StepName did not return JSON output."
    }

    $jsonStarts = [regex]::Matches($outputText, '(?m)^\{')
    if ($jsonStarts.Count -eq 0) {
        throw "$StepName did not return a top-level JSON object. Output=$outputText"
    }

    $jsonText = $outputText.Substring($jsonStarts[$jsonStarts.Count - 1].Index)
    return $jsonText | ConvertFrom-Json
}

function ConvertTo-PowerShellSingleQuotedLiteral {
    param([Parameter(Mandatory = $true)] [string]$Value)
    return "'" + ($Value -replace "'", "''") + "'"
}

function Format-CheckTable {
    param([Parameter(Mandatory = $true)] [pscustomobject]$Checks)

    $lines = @(
        "| Check | Result |",
        "| --- | --- |"
    )
    foreach ($property in $Checks.PSObject.Properties) {
        $resultText = if ([bool]$property.Value) { "true" } else { "false" }
        $lines += "| $($property.Name) | $resultText |"
    }
    return $lines -join "`r`n"
}

function Add-VmRootLine {
    param(
        [AllowNull()] [object]$Smoke,
        [Parameter(Mandatory = $true)] [string]$Label
    )

    if ($null -eq $Smoke -or -not $Smoke.QaRoot) {
        return "- ${Label}: not run"
    }

    $browserSuffix = if ($Smoke.Browser) { " ($($Smoke.Browser))" } else { "" }
    $localSuffix = if ($Smoke.LocalScreenshotRoot) { "; local screenshots: $($Smoke.LocalScreenshotRoot)" } else { "" }
    return "- ${Label}${browserSuffix}: $($Smoke.QaRoot)$localSuffix"
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$resolvedOutDir = Resolve-RepoPath -Path $OutDir
$outputRoot = Assert-PathUnderRepo -Path $resolvedOutDir -Description "Release handoff output root"
New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

$candidateArgs = [string[]]@()
if ($RunVmSmokes) {
    $candidateArgs += "-RunVmSmokes"
    $candidateArgs += "-VmName"
    $candidateArgs += $VmName
    $candidateArgs += "-CredentialPath"
    $candidateArgs += $CredentialPath
    if ($ChromeForTestingZipPath) {
        $candidateArgs += "-ChromeForTestingZipPath"
        $candidateArgs += $ChromeForTestingZipPath
    }
}
if ($SkipPackageTests) {
    $candidateArgs += "-SkipPackageTests"
}
if ($RequireStoreReady) {
    $candidateArgs += "-RequireStoreReady"
}

$candidateScript = Join-Path $PSScriptRoot "prepare-browser-extension-release-candidate.ps1"
$repoRootLiteral = ConvertTo-PowerShellSingleQuotedLiteral $RepoRoot
$candidateScriptLiteral = ConvertTo-PowerShellSingleQuotedLiteral $candidateScript
$candidateCommand = "Set-Location -LiteralPath $repoRootLiteral; & $candidateScriptLiteral @args"
$candidateOutput = & powershell -NoProfile -ExecutionPolicy Bypass -Command $candidateCommand @candidateArgs 2>&1
if ($LASTEXITCODE -ne 0) {
    $outputText = ($candidateOutput | Out-String).Trim()
    throw "Release candidate preparation failed with exit code ${LASTEXITCODE}. Output=$outputText"
}
$candidate = ConvertFrom-CommandJson -CommandOutput $candidateOutput -StepName "Release candidate preparation"

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$baseName = "alfaraheedi-browser-extension-$($candidate.Version)-release-handoff-$timestamp"
$jsonPath = Join-Path $outputRoot "$baseName.json"
$markdownPath = Join-Path $outputRoot "$baseName.md"

$candidate | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $jsonPath -Encoding UTF8

$localCheckTable = Format-CheckTable $candidate.Readiness.LocalChecks
$selectedScreenshotRoot = $candidate.Readiness.SelectedScreenshotRoot
$storeBundleScreenshotRoot = $candidate.Export.ScreenshotRoot
$screenshotRootsMatch = [string]$selectedScreenshotRoot -eq [string]$storeBundleScreenshotRoot
$externalBlockerLines = if (@($candidate.ExternalBlockers).Count -gt 0) {
    (@($candidate.ExternalBlockers) | ForEach-Object { "- $_" }) -join "`r`n"
} else {
    "- None"
}
$vmRootLines = @(
    Add-VmRootLine -Smoke $candidate.Preflight.EdgeAccessibilityTreeSmoke -Label "Edge Accessibility Tree smoke"
    Add-VmRootLine -Smoke $candidate.Preflight.EdgeProductionEditorsSmoke -Label "Edge production-editor fixture smoke"
    Add-VmRootLine -Smoke $candidate.Preflight.EdgeStoreScreenshots -Label "Edge store screenshot capture"
    Add-VmRootLine -Smoke $candidate.Preflight.EdgeKeyboardSmoke -Label "Edge keyboard-flow smoke"
    Add-VmRootLine -Smoke $candidate.Preflight.ChromeForTestingKeyboardSmoke -Label "Chrome for Testing keyboard-flow smoke"
) -join "`r`n"

@"
# Alfaraheedi Browser Extension Release Handoff

Generated: $($candidate.GeneratedAtUtc)
Version: $($candidate.Version)

This handoff is generated from local release tooling. It is safe to attach to a
PR or use as a store-submission checklist because it contains artifact paths,
release checks, and blocker summaries only. Do not add private account text,
tokens, store dashboard identifiers, or private screenshots to this file.

## Status

- Local ready: $($candidate.LocalReady)
- Store ready: $($candidate.StoreReady)
- VM smokes requested: $($candidate.VmSmokesRequested)
- Package: $($candidate.Package)
- Store submission bundle: $($candidate.StoreSubmissionRoot)
- Release manifest: $($candidate.ReleaseManifest)
- Selected screenshot root: $selectedScreenshotRoot
- Store bundle screenshot root: $storeBundleScreenshotRoot
- Store bundle screenshots match selected root: $screenshotRootsMatch
- Latest manual QA report template: $($candidate.LatestManualQaReport)
- Manual QA completed: $($candidate.ManualQaReportCompleted)
- Manual QA release decision: $($candidate.ManualQaReleaseDecision)

## Local Checks

$localCheckTable

## Reviewer Docs

- Store submission notes: 02-reviewer-docs/STORE_SUBMISSION.md
- Store asset notes: 02-reviewer-docs/STORE_ASSETS.md
- Manual release gates: 02-reviewer-docs/MANUAL_RELEASE_GATES.md
- Public validation summary: 02-reviewer-docs/browser-extension-v0.7-validation.md
- Privacy policy: 02-reviewer-docs/PRIVACY_POLICY.md
- Public privacy page source: 02-reviewer-docs/privacy.html

## VM Evidence Roots

VM screenshot capture roots are evidence candidates. The actual store-submission
bundle uses the selected screenshot root above.

$vmRootLines

## External Blockers

$externalBlockerLines

## Next Required Actions

- Merge the browser-extension branch and let CI publish the release artifact.
- Let the GitHub Pages workflow deploy from main, then verify the public privacy URL with .\scripts\check-browser-extension-pages-readiness.ps1 -RequireReady.
- Complete browser-extension/MANUAL_RELEASE_GATES.md for live Gmail, WhatsApp Web, Google Docs, screen-reader, and store-dashboard checks.
- Submit to Chrome Web Store and Microsoft Edge Add-ons only after the live privacy URL and manual gates have current evidence.
"@ | Set-Content -LiteralPath $markdownPath -Encoding UTF8

[pscustomobject]@{
    Markdown = $markdownPath
    Json = $jsonPath
    Version = $candidate.Version
    LocalReady = [bool]$candidate.LocalReady
    StoreReady = [bool]$candidate.StoreReady
    VmSmokesRequested = [bool]$candidate.VmSmokesRequested
    SelectedScreenshotRoot = $selectedScreenshotRoot
    StoreBundleScreenshotRoot = $storeBundleScreenshotRoot
    ScreenshotRootsMatch = $screenshotRootsMatch
    ManualQaReportCompleted = [bool]$candidate.ManualQaReportCompleted
    ManualQaReleaseDecision = $candidate.ManualQaReleaseDecision
    ExternalBlockers = $candidate.ExternalBlockers
} | ConvertTo-Json -Depth 6
