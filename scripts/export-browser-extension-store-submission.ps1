param(
    [string]$ExtensionRoot = "browser-extension",

    [string]$OutDir = "dist\browser-extension-store-submission",

    [string]$ScreenshotRoot = "",

    [switch]$SkipPreflight,

    [switch]$AllowMissingScreenshots
)

$ErrorActionPreference = "Stop"

function Resolve-RepoPath {
    param([Parameter(Mandatory = $true)] [string]$Path)
    if ([IO.Path]::IsPathRooted($Path)) {
        return $Path
    }
    return Join-Path $script:RepoRoot $Path
}

function Copy-RequiredFile {
    param(
        [Parameter(Mandatory = $true)] [string]$Source,
        [Parameter(Mandatory = $true)] [string]$Destination
    )

    if (-not (Test-Path -LiteralPath $Source)) {
        throw "Required file not found: $Source"
    }

    $destinationParent = Split-Path -Parent $Destination
    New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
    Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

function Get-SelectedScreenshotRoot {
    param(
        [Parameter(Mandatory = $true)] [string]$AssetManifestPath,
        [AllowEmptyString()] [string]$ExplicitScreenshotRoot
    )

    if ($ExplicitScreenshotRoot) {
        return (Resolve-RepoPath $ExplicitScreenshotRoot)
    }

    $assetManifest = Get-Content -LiteralPath $AssetManifestPath -Raw
    $pathMatches = [regex]::Matches(
        $assetManifest,
        '(?m)^(?:[A-Z]:\\.*?browser-extension-store-assets\\[^\r\n<>]+|dist\\browser-extension-store-assets\\[^\r\n<>]+)$'
    )
    if ($pathMatches.Count -eq 0) {
        throw "Could not find selected screenshot root in STORE_ASSETS.md. Pass -ScreenshotRoot explicitly."
    }

    return (Resolve-RepoPath $pathMatches[$pathMatches.Count - 1].Value.Trim())
}

function Copy-SelectedScreenshots {
    param(
        [Parameter(Mandatory = $true)] [string]$SelectedScreenshotRoot,
        [Parameter(Mandatory = $true)] [string]$DestinationRoot,
        [Parameter(Mandatory = $true)] [bool]$AllowMissing
    )

    $selectedFiles = @(
        "01-options-settings.png",
        "02-popup-status.png",
        "03-web-field-suggestions.png"
    )
    $copiedScreenshots = @()

    foreach ($fileName in $selectedFiles) {
        $source = Join-Path $SelectedScreenshotRoot $fileName
        $destination = Join-Path $DestinationRoot $fileName
        if (-not (Test-Path -LiteralPath $source)) {
            if ($AllowMissing) {
                continue
            }
            throw "Selected screenshot missing: $source"
        }

        Copy-RequiredFile $source $destination
        $copiedScreenshots += $destination
    }

    return $copiedScreenshots
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

function New-ReleaseManifestFileRecord {
    param(
        [Parameter(Mandatory = $true)] [string]$BundleRoot,
        [Parameter(Mandatory = $true)] [string]$Path
    )

    $fileInfo = Get-Item -LiteralPath $Path
    $fileHash = Get-FileHash -LiteralPath $Path -Algorithm SHA256
    return [pscustomobject]@{
        Path = Get-RelativeBundlePath $BundleRoot $Path
        Sha256 = $fileHash.Hash
        Bytes = $fileInfo.Length
    }
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$extensionPath = Resolve-RepoPath $ExtensionRoot
$assetManifestPath = Join-Path $extensionPath "STORE_ASSETS.md"
$manifestPath = Join-Path $extensionPath "manifest.json"
$submissionNotesPath = Join-Path $extensionPath "STORE_SUBMISSION.md"
$manualGatePath = Join-Path $extensionPath "MANUAL_RELEASE_GATES.md"
$privacyPolicyPath = Join-Path $extensionPath "PRIVACY_POLICY.md"
$publicPrivacyPagePath = Join-Path $RepoRoot "docs\public\browser-extension\privacy.html"
$validationSummaryPath = Join-Path $RepoRoot "docs\testing\browser-extension-v0.7-validation.md"

if (-not (Test-Path -LiteralPath $extensionPath)) {
    throw "Extension root not found: $extensionPath"
}
if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "Extension manifest not found: $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$submissionRootName = "nahou-browser-extension-$($manifest.version)-store-submission"
$submissionRoot = Join-Path (Resolve-RepoPath $OutDir) $submissionRootName
$submissionRoot = Assert-PathUnderRepo $submissionRoot "Store submission export root"
$uploadRoot = Join-Path $submissionRoot "01-upload-package"
$docsRoot = Join-Path $submissionRoot "02-reviewer-docs"
$screenshotsRoot = Join-Path $submissionRoot "03-screenshots"

if (-not $SkipPreflight) {
    & (Join-Path $PSScriptRoot "validate-browser-extension-release.ps1") -ExtensionRoot $ExtensionRoot
    if ($LASTEXITCODE -ne 0) {
        throw "Browser extension release preflight failed."
    }
    $packagePath = Join-Path $RepoRoot "dist\browser-extension\nahou-browser-extension-$($manifest.version).zip"
} else {
    $packageJson = & (Join-Path $PSScriptRoot "package-browser-extension.ps1") -ExtensionRoot $ExtensionRoot
    if ($LASTEXITCODE -ne 0) {
        throw "Browser extension package script failed."
    }
    $packageResult = $packageJson | ConvertFrom-Json
    $packagePath = $packageResult.Package
}

if (-not (Test-Path -LiteralPath $packagePath)) {
    throw "Browser extension package not found: $packagePath"
}

if (Test-Path -LiteralPath $submissionRoot) {
    Remove-Item -LiteralPath $submissionRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $uploadRoot, $docsRoot, $screenshotsRoot | Out-Null

$selectedScreenshotRoot = Get-SelectedScreenshotRoot $assetManifestPath $ScreenshotRoot
$copiedScreenshots = Copy-SelectedScreenshots $selectedScreenshotRoot $screenshotsRoot ([bool]$AllowMissingScreenshots)

$packageDestination = Join-Path $uploadRoot (Split-Path -Leaf $packagePath)
Copy-RequiredFile $packagePath $packageDestination
$reviewerDocPaths = @(
    (Join-Path $docsRoot "manifest.json"),
    (Join-Path $docsRoot "STORE_SUBMISSION.md"),
    (Join-Path $docsRoot "STORE_ASSETS.md"),
    (Join-Path $docsRoot "MANUAL_RELEASE_GATES.md"),
    (Join-Path $docsRoot "browser-extension-v0.7-validation.md"),
    (Join-Path $docsRoot "PRIVACY_POLICY.md"),
    (Join-Path $docsRoot "privacy.html")
)
Copy-RequiredFile $manifestPath $reviewerDocPaths[0]
Copy-RequiredFile $submissionNotesPath $reviewerDocPaths[1]
Copy-RequiredFile $assetManifestPath $reviewerDocPaths[2]
Copy-RequiredFile $manualGatePath $reviewerDocPaths[3]
Copy-RequiredFile $validationSummaryPath $reviewerDocPaths[4]
Copy-RequiredFile $privacyPolicyPath $reviewerDocPaths[5]
Copy-RequiredFile $publicPrivacyPagePath $reviewerDocPaths[6]

$readmePath = Join-Path $submissionRoot "README.md"
@"
# Nahou Browser Extension Store Submission Bundle

This folder is a local upload-prep bundle for Nahou browser extension
v$($manifest.version). It does not prove Chrome Web Store or Edge Add-ons
approval.

## Contents

- `01-upload-package`: extension zip to upload.
- `02-reviewer-docs`: source-controlled privacy policy, store submission notes,
  public privacy page preview, store asset checklist, public validation summary,
  manual release gates, and manifest copy.
- `03-screenshots`: selected screenshot candidates from `STORE_ASSETS.md`.
- `RELEASE_MANIFEST.json`: SHA-256 hashes and byte counts for the upload zip,
  reviewer docs, and selected screenshots.

## Before Upload

- Publish `02-reviewer-docs/PRIVACY_POLICY.md` at a stable public URL.
- After Pages deployment, verify the live URL with
  `.\scripts\check-browser-extension-public-privacy-url.ps1 -RequireLive`.
- Check repository Pages readiness with
  `.\scripts\check-browser-extension-pages-readiness.ps1`.
- Create a private manual QA report template with
  `.\scripts\new-browser-extension-manual-qa-report.ps1` and complete the
  live-editor, screen-reader, and store-dashboard gates from
  `02-reviewer-docs/MANUAL_RELEASE_GATES.md`.
- Paste listing copy, permission justifications, and reviewer notes from
  `02-reviewer-docs/STORE_SUBMISSION.md`.
- Upload the screenshots from `03-screenshots` after manual visual review.
- Do not claim live Gmail, WhatsApp Web, Google Docs, Word, or PowerPoint
  integration until those exact surfaces have current verification.
- Keep the first Edge submission hidden/private unless live-editor and manual
  accessibility checks have been completed.
"@ | Set-Content -LiteralPath $readmePath -Encoding UTF8

$releaseManifestPath = Join-Path $submissionRoot "RELEASE_MANIFEST.json"
$releaseManifest = [pscustomobject]@{
    Version = $manifest.version
    GeneratedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    Package = New-ReleaseManifestFileRecord $submissionRoot $packageDestination
    ReviewerDocs = @($reviewerDocPaths | ForEach-Object {
        New-ReleaseManifestFileRecord $submissionRoot $_
    })
    Screenshots = @($copiedScreenshots | ForEach-Object {
        New-ReleaseManifestFileRecord $submissionRoot $_
    })
    ScreenshotRoot = $selectedScreenshotRoot
    PrivacyPolicyStillNeedsPublicUrl = $true
}
$releaseManifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $releaseManifestPath -Encoding UTF8
$integrityArgs = @{
    StoreSubmissionRoot = $submissionRoot
}
if (-not $AllowMissingScreenshots) {
    $integrityArgs.RequireValid = $true
}
$integrityJson = & (Join-Path $PSScriptRoot "check-browser-extension-store-submission-integrity.ps1") @integrityArgs
if ($LASTEXITCODE -ne 0) {
    throw "Store submission integrity check failed."
}
$integrityResult = $integrityJson | ConvertFrom-Json

[pscustomobject]@{
    Version = $manifest.version
    SubmissionRoot = $submissionRoot
    Package = $packageDestination
    ReleaseManifest = $releaseManifestPath
    IntegrityReady = $integrityResult.IntegrityReady
    ReviewerDocs = $reviewerDocPaths
    Screenshots = $copiedScreenshots
    ScreenshotRoot = $selectedScreenshotRoot
    PrivacyPolicyStillNeedsPublicUrl = $true
} | ConvertTo-Json -Depth 6
