param(
    [string]$ExtensionRoot = "browser-extension",

    [string]$StoreSubmissionRoot = "",

    [switch]$RequireValid
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

function Get-SelectedScreenshotRoot {
    param([Parameter(Mandatory = $true)] [string]$AssetManifestPath)

    if (-not (Test-Path -LiteralPath $AssetManifestPath)) {
        return ""
    }

    $assetManifest = Get-Content -LiteralPath $AssetManifestPath -Raw
    $pathMatches = [regex]::Matches(
        $assetManifest,
        '(?m)^(?:[A-Z]:\\.*?browser-extension-store-assets\\v0\.7-extension-store-screenshots-\d{8}-\d{6}|dist\\browser-extension-store-assets\\v0\.7-extension-store-screenshots-\d{8}-\d{6})$'
    )
    if ($pathMatches.Count -eq 0) {
        return ""
    }

    return (Resolve-RepoPath $pathMatches[$pathMatches.Count - 1].Value.Trim())
}

function Test-SameDirectoryPath {
    param(
        [AllowEmptyString()] [string]$Left,
        [AllowEmptyString()] [string]$Right
    )

    if (-not $Left -or -not $Right) {
        return $false
    }

    $leftPath = [IO.Path]::GetFullPath($Left).TrimEnd('\')
    $rightPath = [IO.Path]::GetFullPath($Right).TrimEnd('\')
    return $leftPath.Equals($rightPath, [StringComparison]::OrdinalIgnoreCase)
}

function Test-ManifestRecord {
    param(
        [Parameter(Mandatory = $true)] [object]$Record,
        [Parameter(Mandatory = $true)] [string]$BundleRoot
    )

    if (-not $Record.Path -or -not $Record.Sha256 -or $null -eq $Record.Bytes) {
        return [pscustomobject]@{
            Path = $Record.Path
            Exists = $false
            HashMatches = $false
            BytesMatch = $false
            Valid = $false
        }
    }

    $filePath = Join-Path $BundleRoot ($Record.Path -replace '/', '\')
    $exists = Test-PathOrNull $filePath
    if (-not $exists) {
        return [pscustomobject]@{
            Path = $Record.Path
            Exists = $false
            HashMatches = $false
            BytesMatch = $false
            Valid = $false
        }
    }

    $fileInfo = Get-Item -LiteralPath $filePath
    $fileHash = Get-FileHash -LiteralPath $filePath -Algorithm SHA256
    $hashMatches = $fileHash.Hash -eq $Record.Sha256
    $bytesMatch = $fileInfo.Length -eq [int64]$Record.Bytes

    return [pscustomobject]@{
        Path = Get-RelativeBundlePath $BundleRoot $filePath
        Exists = $true
        HashMatches = $hashMatches
        BytesMatch = $bytesMatch
        Valid = [bool]($hashMatches -and $bytesMatch)
    }
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$extensionPath = Resolve-RepoPath $ExtensionRoot
$manifestPath = Join-Path $extensionPath "manifest.json"
$assetManifestPath = Join-Path $extensionPath "STORE_ASSETS.md"
if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "Browser extension manifest not found: $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$version = $manifest.version
if (-not $StoreSubmissionRoot) {
    $StoreSubmissionRoot = Join-Path $RepoRoot "dist\browser-extension-store-submission\alfaraheedi-browser-extension-$version-store-submission"
} else {
    $StoreSubmissionRoot = Resolve-RepoPath $StoreSubmissionRoot
}

$releaseManifestPath = Join-Path $StoreSubmissionRoot "RELEASE_MANIFEST.json"
$requiredReviewerDocPaths = @(
    "02-reviewer-docs/manifest.json",
    "02-reviewer-docs/STORE_SUBMISSION.md",
    "02-reviewer-docs/STORE_ASSETS.md",
    "02-reviewer-docs/MANUAL_RELEASE_GATES.md",
    "02-reviewer-docs/browser-extension-v0.7-validation.md",
    "02-reviewer-docs/PRIVACY_POLICY.md",
    "02-reviewer-docs/privacy.html"
)
$requiredScreenshotPaths = @(
    "03-screenshots/01-options-settings.png",
    "03-screenshots/02-popup-status.png",
    "03-screenshots/03-web-field-suggestions.png"
)

$releaseManifestExists = Test-PathOrNull $releaseManifestPath
$packageRecord = $null
$reviewerDocRecords = @()
$screenshotRecords = @()
$missingRequiredReviewerDocRecords = $requiredReviewerDocPaths
$missingRequiredScreenshotRecords = $requiredScreenshotPaths
$versionMatches = $false
$privacyPolicyStillNeedsPublicUrl = $null
$selectedScreenshotRoot = Get-SelectedScreenshotRoot $assetManifestPath
$storeBundleScreenshotRoot = ""
$screenshotRootsMatch = $false

if ($releaseManifestExists) {
    $releaseManifest = Get-Content -LiteralPath $releaseManifestPath -Raw | ConvertFrom-Json
    $versionMatches = $releaseManifest.Version -eq $version
    $privacyPolicyStillNeedsPublicUrl = $releaseManifest.PrivacyPolicyStillNeedsPublicUrl
    if ($releaseManifest.ScreenshotRoot) {
        $storeBundleScreenshotRoot = Resolve-RepoPath ([string]$releaseManifest.ScreenshotRoot)
    }
    $screenshotRootsMatch = Test-SameDirectoryPath $selectedScreenshotRoot $storeBundleScreenshotRoot
    $packageRecord = Test-ManifestRecord $releaseManifest.Package $StoreSubmissionRoot
    $reviewerDocRecords = @($releaseManifest.ReviewerDocs | ForEach-Object {
        Test-ManifestRecord $_ $StoreSubmissionRoot
    })
    $screenshotRecords = @($releaseManifest.Screenshots | ForEach-Object {
        Test-ManifestRecord $_ $StoreSubmissionRoot
    })

    $recordedReviewerDocPaths = [string[]]@($releaseManifest.ReviewerDocs | ForEach-Object { $_.Path })
    $recordedScreenshotPaths = [string[]]@($releaseManifest.Screenshots | ForEach-Object { $_.Path })
    $missingRequiredReviewerDocRecords = @($requiredReviewerDocPaths | Where-Object {
        $recordedReviewerDocPaths -notcontains $_
    })
    $missingRequiredScreenshotRecords = @($requiredScreenshotPaths | Where-Object {
        $recordedScreenshotPaths -notcontains $_
    })
}

$allRecords = @()
if ($packageRecord) {
    $allRecords += $packageRecord
}
$allRecords += $reviewerDocRecords
$allRecords += $screenshotRecords

$invalidRecords = @($allRecords | Where-Object { -not $_.Valid })
$expectedPackagePath = "01-upload-package/alfaraheedi-browser-extension-$version.zip"
$packageRecordPathMatches = $false
if ($packageRecord) {
    $packageRecordPathMatches = $packageRecord.Path -eq $expectedPackagePath
}

$integrityReady = [bool](
    $releaseManifestExists -and
    $versionMatches -and
    $packageRecordPathMatches -and
    $packageRecord -and
    $packageRecord.Valid -and
    $missingRequiredReviewerDocRecords.Count -eq 0 -and
    $missingRequiredScreenshotRecords.Count -eq 0 -and
    $screenshotRootsMatch -and
    $invalidRecords.Count -eq 0
)

$result = [pscustomobject]@{
    Version = $version
    StoreSubmissionRoot = $StoreSubmissionRoot
    ReleaseManifest = $releaseManifestPath
    ReleaseManifestExists = $releaseManifestExists
    VersionMatches = $versionMatches
    PackageRecordPathMatches = $packageRecordPathMatches
    PackageRecord = $packageRecord
    ReviewerDocRecords = $reviewerDocRecords
    ScreenshotRecords = $screenshotRecords
    MissingRequiredReviewerDocRecords = $missingRequiredReviewerDocRecords
    MissingRequiredScreenshotRecords = $missingRequiredScreenshotRecords
    InvalidRecords = $invalidRecords
    PrivacyPolicyStillNeedsPublicUrl = $privacyPolicyStillNeedsPublicUrl
    SelectedScreenshotRoot = $selectedScreenshotRoot
    StoreBundleScreenshotRoot = $storeBundleScreenshotRoot
    ScreenshotRootsMatch = $screenshotRootsMatch
    IntegrityReady = $integrityReady
}

$result | ConvertTo-Json -Depth 8

if ($RequireValid -and -not $integrityReady) {
    throw "Browser extension store submission integrity check failed."
}
