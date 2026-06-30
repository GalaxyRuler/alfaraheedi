param(
    [string]$ExtensionRoot = "browser-extension",

    [string]$StoreSubmissionRoot = "",

    [string]$ManualQaRoot = "dist\browser-extension-manual-qa",

    [string]$Repository = "GalaxyRuler/alfaraheedi",

    [string]$Branch = "main",

    [string]$PrivacyUrl = "https://galaxyruler.github.io/alfaraheedi/browser-extension/privacy.html",

    [switch]$RequireLocalReady,

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

function Test-PathOrNull {
    param([AllowEmptyString()] [string]$Path)
    if (-not $Path) {
        return $false
    }
    return Test-Path -LiteralPath $Path
}

function Test-SameFileHash {
    param(
        [AllowEmptyString()] [string]$FirstPath,
        [AllowEmptyString()] [string]$SecondPath
    )

    if (-not (Test-PathOrNull $FirstPath) -or -not (Test-PathOrNull $SecondPath)) {
        return $false
    }

    $firstHash = Get-FileHash -LiteralPath $FirstPath -Algorithm SHA256
    $secondHash = Get-FileHash -LiteralPath $SecondPath -Algorithm SHA256
    return $firstHash.Hash -eq $secondHash.Hash
}

function Test-ReleaseManifestPackageHash {
    param(
        [AllowEmptyString()] [string]$ReleaseManifestPath,
        [AllowEmptyString()] [string]$PackagePath
    )

    if (-not (Test-PathOrNull $ReleaseManifestPath) -or -not (Test-PathOrNull $PackagePath)) {
        return $false
    }

    $releaseManifest = Get-Content -LiteralPath $ReleaseManifestPath -Raw | ConvertFrom-Json
    if (-not $releaseManifest.Package.Sha256) {
        return $false
    }

    $packageHash = Get-FileHash -LiteralPath $PackagePath -Algorithm SHA256
    return $releaseManifest.Package.Sha256 -eq $packageHash.Hash
}

function Get-RelativeBundlePath {
    param(
        [Parameter(Mandatory = $true)] [string]$BundleRoot,
        [Parameter(Mandatory = $true)] [string]$Path
    )

    $rootPath = [IO.Path]::GetFullPath($BundleRoot).TrimEnd('\') + '\'
    $fullPath = [IO.Path]::GetFullPath($Path)
    if (-not $fullPath.StartsWith($rootPath, [StringComparison]::OrdinalIgnoreCase)) {
        return $fullPath
    }

    return $fullPath.Substring($rootPath.Length).Replace('\', '/')
}

function Test-ReleaseManifestFileRecords {
    param(
        [AllowEmptyString()] [string]$ReleaseManifestPath,
        [AllowEmptyString()] [string]$BundleRoot,
        [Parameter(Mandatory = $true)] [string]$SectionName,
        [Parameter(Mandatory = $true)] [string[]]$FilePaths
    )

    if (-not (Test-PathOrNull $ReleaseManifestPath) -or -not (Test-PathOrNull $BundleRoot)) {
        return $false
    }

    $releaseManifest = Get-Content -LiteralPath $ReleaseManifestPath -Raw | ConvertFrom-Json
    $records = @($releaseManifest.$SectionName)
    if ($records.Count -ne $FilePaths.Count) {
        return $false
    }

    foreach ($filePath in $FilePaths) {
        if (-not (Test-PathOrNull $filePath)) {
            return $false
        }

        $relativePath = Get-RelativeBundlePath $BundleRoot $filePath
        $record = @($records | Where-Object { $_.Path -eq $relativePath } | Select-Object -First 1)
        if ($record.Count -ne 1) {
            return $false
        }

        $fileInfo = Get-Item -LiteralPath $filePath
        $fileHash = Get-FileHash -LiteralPath $filePath -Algorithm SHA256
        if ($record[0].Sha256 -ne $fileHash.Hash -or [int64]$record[0].Bytes -ne $fileInfo.Length) {
            return $false
        }
    }

    return $true
}

function Get-SelectedScreenshotRoot {
    param([Parameter(Mandatory = $true)] [string]$AssetManifestPath)

    if (-not (Test-Path -LiteralPath $AssetManifestPath)) {
        return ""
    }

    $assetManifest = Get-Content -LiteralPath $AssetManifestPath -Raw
    $pathMatches = [regex]::Matches(
        $assetManifest,
        '(?m)^\s*(?:[A-Z]:\\.*?browser-extension-store-assets\\[^\r\n<>]+|dist\\browser-extension-store-assets\\[^\r\n<>]+)\s*$'
    )
    if ($pathMatches.Count -eq 0) {
        return ""
    }

    return (Resolve-RepoPath $pathMatches[$pathMatches.Count - 1].Value.Trim())
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$extensionPath = Resolve-RepoPath $ExtensionRoot
$manifestPath = Join-Path $extensionPath "manifest.json"
$assetManifestPath = Join-Path $extensionPath "STORE_ASSETS.md"
$manualGatePath = Join-Path $extensionPath "MANUAL_RELEASE_GATES.md"
$privacyPolicyPath = Join-Path $extensionPath "PRIVACY_POLICY.md"
$publicPrivacyPagePath = Join-Path $RepoRoot "docs\public\browser-extension\privacy.html"

if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "Browser extension manifest not found: $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$version = $manifest.version
$packagePath = Join-Path $RepoRoot "dist\browser-extension\nahou-browser-extension-$version.zip"
if (-not $StoreSubmissionRoot) {
    $StoreSubmissionRoot = Join-Path $RepoRoot "dist\browser-extension-store-submission\nahou-browser-extension-$version-store-submission"
} else {
    $StoreSubmissionRoot = Resolve-RepoPath $StoreSubmissionRoot
}

$manualQaReportJson = & (Join-Path $PSScriptRoot "check-browser-extension-manual-qa-report.ps1") `
    -ManualQaRoot $ManualQaRoot `
    -GatePath $manualGatePath
$manualQaReport = $manualQaReportJson | ConvertFrom-Json
$latestManualQaReportPath = $manualQaReport.Report
$manualQaGateHashMatches = [bool]$manualQaReport.GateHashMatches
$manualQaReportCompleted = [bool]$manualQaReport.Completed
$manualQaReleaseDecision = $manualQaReport.ReleaseDecision

$selectedScreenshotRoot = Get-SelectedScreenshotRoot $assetManifestPath
$selectedScreenshotFiles = @(
    "01-options-settings.png",
    "02-popup-status.png",
    "03-web-field-suggestions.png"
)
$selectedScreenshotsExist = $false
if ($selectedScreenshotRoot -and (Test-Path -LiteralPath $selectedScreenshotRoot)) {
    $missingScreenshots = @($selectedScreenshotFiles | Where-Object {
        -not (Test-Path -LiteralPath (Join-Path $selectedScreenshotRoot $_))
    })
    $selectedScreenshotsExist = $missingScreenshots.Count -eq 0
} else {
    $missingScreenshots = $selectedScreenshotFiles
}

$uploadPackagePath = Join-Path $StoreSubmissionRoot "01-upload-package\nahou-browser-extension-$version.zip"
$releaseManifestPath = Join-Path $StoreSubmissionRoot "RELEASE_MANIFEST.json"
$reviewerDocsRoot = Join-Path $StoreSubmissionRoot "02-reviewer-docs"
$storeScreenshotsRoot = Join-Path $StoreSubmissionRoot "03-screenshots"
$requiredReviewerDocs = @(
    "manifest.json",
    "STORE_SUBMISSION.md",
    "STORE_ASSETS.md",
    "MANUAL_RELEASE_GATES.md",
    "browser-extension-v0.7-validation.md",
    "PRIVACY_POLICY.md",
    "privacy.html"
)
$reviewerDocPaths = [string[]]@($requiredReviewerDocs | ForEach-Object {
    Join-Path $reviewerDocsRoot $_
})
$exportedScreenshotPaths = [string[]]@($selectedScreenshotFiles | ForEach-Object {
    Join-Path $storeScreenshotsRoot $_
})
$missingReviewerDocs = @($requiredReviewerDocs | Where-Object {
    -not (Test-Path -LiteralPath (Join-Path $reviewerDocsRoot $_))
})
$missingExportScreenshots = @($selectedScreenshotFiles | Where-Object {
    -not (Test-Path -LiteralPath (Join-Path $storeScreenshotsRoot $_))
})

$pagesReadinessJson = & (Join-Path $PSScriptRoot "check-browser-extension-pages-readiness.ps1") `
    -Repository $Repository `
    -Branch $Branch `
    -PrivacyUrl $PrivacyUrl
$pagesReadiness = $pagesReadinessJson | ConvertFrom-Json
$storeSubmissionIntegrityJson = & (Join-Path $PSScriptRoot "check-browser-extension-store-submission-integrity.ps1") `
    -ExtensionRoot $ExtensionRoot `
    -StoreSubmissionRoot $StoreSubmissionRoot
$storeSubmissionIntegrity = $storeSubmissionIntegrityJson | ConvertFrom-Json

$localChecks = [ordered]@{
    Manifest = Test-PathOrNull $manifestPath
    Package = Test-PathOrNull $packagePath
    StoreAssetManifest = Test-PathOrNull $assetManifestPath
    SelectedScreenshotRoot = Test-PathOrNull $selectedScreenshotRoot
    SelectedScreenshots = $selectedScreenshotsExist
    StoreSubmissionBundle = Test-PathOrNull $StoreSubmissionRoot
    StoreUploadPackage = Test-PathOrNull $uploadPackagePath
    StoreUploadPackageMatchesPackage = Test-SameFileHash $packagePath $uploadPackagePath
    StoreReleaseManifest = Test-PathOrNull $releaseManifestPath
    ReleaseManifestPackageHash = Test-ReleaseManifestPackageHash $releaseManifestPath $packagePath
    ReleaseManifestReviewerDocs = Test-ReleaseManifestFileRecords $releaseManifestPath $StoreSubmissionRoot "ReviewerDocs" $reviewerDocPaths
    ReleaseManifestScreenshots = Test-ReleaseManifestFileRecords $releaseManifestPath $StoreSubmissionRoot "Screenshots" $exportedScreenshotPaths
    StoreSubmissionIntegrity = [bool]$storeSubmissionIntegrity.IntegrityReady
    ReviewerDocs = $missingReviewerDocs.Count -eq 0
    ExportedScreenshots = $missingExportScreenshots.Count -eq 0
    ManualReleaseGates = Test-PathOrNull $manualGatePath
    PrivacyPolicySource = Test-PathOrNull $privacyPolicyPath
    PublicPrivacyPageSource = Test-PathOrNull $publicPrivacyPagePath
    ManualQaReportTemplate = [bool]$manualQaReport.ReportExists
    ManualQaReportGateHashMatches = $manualQaGateHashMatches
}

$localReady = -not ($localChecks.GetEnumerator() | Where-Object { -not $_.Value })
$externalBlockers = @()
if (-not $pagesReadiness.PagesConfigured) {
    $externalBlockers += "GitHub Pages is not configured for $Repository."
}
if (-not $pagesReadiness.WorkflowOnBranch) {
    $externalBlockers += ".github/workflows/pages.yml is not yet available on $Branch."
}
if (-not $pagesReadiness.ReadyForStorePrivacyUrl) {
    $externalBlockers += "The public browser-extension privacy URL is not live or does not match required policy text."
}
if (-not $manualQaReportCompleted) {
    $externalBlockers += "Live Gmail, WhatsApp Web, Google Docs, and other production-editor manual QA still needs account-side evidence."
    $externalBlockers += "Manual screen-reader review still needs human assistive-technology evidence."
    $externalBlockers += "Chrome Web Store and Edge Add-ons submission/review still need account-side completion."
}
$storeReady = [bool]($localReady -and $pagesReadiness.ReadyForStoreSubmission -and $externalBlockers.Count -eq 0)

$result = [pscustomobject]@{
    Version = $version
    Package = $packagePath
    StoreSubmissionRoot = $StoreSubmissionRoot
    ReleaseManifest = $releaseManifestPath
    SelectedScreenshotRoot = $selectedScreenshotRoot
    LatestManualQaReport = $latestManualQaReportPath
    ManualQaReportGateHashMatches = $manualQaGateHashMatches
    ManualQaReportCompleted = $manualQaReportCompleted
    ManualQaReleaseDecision = $manualQaReleaseDecision
    LocalChecks = [pscustomobject]$localChecks
    MissingReviewerDocs = $missingReviewerDocs
    MissingSelectedScreenshots = $missingScreenshots
    MissingExportedScreenshots = $missingExportScreenshots
    PagesReadiness = $pagesReadiness
    StoreSubmissionIntegrity = $storeSubmissionIntegrity
    LocalReady = $localReady
    StoreReady = $storeReady
    ExternalBlockers = $externalBlockers
}

$result | ConvertTo-Json -Depth 8

if ($RequireLocalReady -and -not $localReady) {
    throw "Browser extension local release artifacts are not ready."
}

if ($RequireStoreReady -and -not $storeReady) {
    $blockerSummary = if ($externalBlockers.Count -gt 0) {
        " External blockers:`n- " + ($externalBlockers -join "`n- ")
    } else {
        ""
    }
    throw "Browser extension is not ready for store submission.$blockerSummary"
}
