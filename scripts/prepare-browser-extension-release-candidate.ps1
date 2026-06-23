param(
    [string]$ExtensionRoot = "browser-extension",

    [string]$StoreSubmissionOutDir = "dist\browser-extension-store-submission",

    [string]$ManualQaRoot = "dist\browser-extension-manual-qa",

    [string]$Repository = "GalaxyRuler/alfaraheedi",

    [string]$Branch = "main",

    [string]$PrivacyUrl = "https://galaxyruler.github.io/alfaraheedi/browser-extension/privacy.html",

    [switch]$SkipPackageTests,

    [switch]$RunVmSmokes,

    [string]$VmName = "",

    [string]$CredentialPath = "",

    [string]$ChromeForTestingZipPath = "",

    [switch]$RequireStoreReady
)

$ErrorActionPreference = "Stop"

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

function Invoke-JsonPowerShellScript {
    param(
        [Parameter(Mandatory = $true)] [string]$ScriptPath,
        [Parameter(Mandatory = $true)] [string[]]$Arguments,
        [Parameter(Mandatory = $true)] [string]$StepName
    )

    $repoRootLiteral = ConvertTo-PowerShellSingleQuotedLiteral $script:repoRoot
    $scriptPathLiteral = ConvertTo-PowerShellSingleQuotedLiteral $ScriptPath
    $command = "Set-Location -LiteralPath $repoRootLiteral; & $scriptPathLiteral @args"
    $commandOutput = & powershell -NoProfile -ExecutionPolicy Bypass -Command $command @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        $outputText = ($commandOutput | Out-String).Trim()
        throw "$StepName failed with exit code ${LASTEXITCODE}. Output=$outputText"
    }

    return ConvertFrom-CommandJson $commandOutput $StepName
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$preflightScript = Join-Path $PSScriptRoot "validate-browser-extension-release.ps1"
$exportScript = Join-Path $PSScriptRoot "export-browser-extension-store-submission.ps1"
$integrityScript = Join-Path $PSScriptRoot "check-browser-extension-store-submission-integrity.ps1"
$readinessScript = Join-Path $PSScriptRoot "get-browser-extension-release-readiness.ps1"

$preflightArgs = [string[]]@("-ExtensionRoot", $ExtensionRoot)
if ($SkipPackageTests) {
    $preflightArgs += "-SkipPackageTests"
}
if ($RunVmSmokes) {
    $preflightArgs += "-RunVmSmokes"
    $preflightArgs += "-VmName"
    $preflightArgs += $VmName
    $preflightArgs += "-CredentialPath"
    $preflightArgs += $CredentialPath
    if ($ChromeForTestingZipPath) {
        $preflightArgs += "-ChromeForTestingZipPath"
        $preflightArgs += $ChromeForTestingZipPath
    }
}

$preflight = Invoke-JsonPowerShellScript $preflightScript $preflightArgs "Release preflight"

$exportArgs = [string[]]@(
    "-ExtensionRoot",
    $ExtensionRoot,
    "-OutDir",
    $StoreSubmissionOutDir,
    "-SkipPreflight"
)
$export = Invoke-JsonPowerShellScript $exportScript $exportArgs "Store submission export"

$integrityArgs = [string[]]@(
    "-ExtensionRoot",
    $ExtensionRoot,
    "-StoreSubmissionRoot",
    $export.SubmissionRoot,
    "-RequireValid"
)
$integrity = Invoke-JsonPowerShellScript $integrityScript $integrityArgs "Store submission integrity"

$readinessArgs = [string[]]@(
    "-ExtensionRoot",
    $ExtensionRoot,
    "-StoreSubmissionRoot",
    $export.SubmissionRoot,
    "-ManualQaRoot",
    $ManualQaRoot,
    "-Repository",
    $Repository,
    "-Branch",
    $Branch,
    "-PrivacyUrl",
    $PrivacyUrl,
    "-RequireLocalReady"
)
if ($RequireStoreReady) {
    $readinessArgs += "-RequireStoreReady"
}
$readiness = Invoke-JsonPowerShellScript $readinessScript $readinessArgs "Release readiness"
$selectedScreenshotRoot = $readiness.SelectedScreenshotRoot
$storeBundleScreenshotRoot = $export.ScreenshotRoot
$screenshotRootsMatch = [string]$selectedScreenshotRoot -eq [string]$storeBundleScreenshotRoot

[pscustomobject]@{
    GeneratedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    RepoRoot = $repoRoot
    Version = $readiness.Version
    Package = $readiness.Package
    StoreSubmissionRoot = $export.SubmissionRoot
    ReleaseManifest = $export.ReleaseManifest
    SelectedScreenshotRoot = $selectedScreenshotRoot
    StoreBundleScreenshotRoot = $storeBundleScreenshotRoot
    ScreenshotRootsMatch = $screenshotRootsMatch
    LatestManualQaReport = $readiness.LatestManualQaReport
    ManualQaReportCompleted = [bool]$readiness.ManualQaReportCompleted
    ManualQaReleaseDecision = $readiness.ManualQaReleaseDecision
    LocalReady = [bool]$readiness.LocalReady
    StoreReady = [bool]$readiness.StoreReady
    VmSmokesRequested = [bool]$RunVmSmokes
    Preflight = $preflight
    Export = $export
    Integrity = $integrity
    Readiness = $readiness
    ExternalBlockers = $readiness.ExternalBlockers
} | ConvertTo-Json -Depth 12
