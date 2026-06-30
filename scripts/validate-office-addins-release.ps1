param(
    [string]$OfficeAddinsRoot = "office-addins",
    [string]$FrontendRoot = "frontend",
    [string]$ReleaseVersion = "",
    [switch]$SkipPackageTests
)

$ErrorActionPreference = "Stop"

function Resolve-RepoPath {
    param([Parameter(Mandatory = $true)] [string]$Path)
    if ([IO.Path]::IsPathRooted($Path)) {
        return $Path
    }
    return Join-Path $script:RepoRoot $Path
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)] [string]$FilePath,
        [Parameter(Mandatory = $true)] [string[]]$ArgumentList,
        [string]$WorkingDirectory = $script:RepoRoot
    )

    Push-Location $WorkingDirectory
    try {
        & $FilePath @ArgumentList
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($ArgumentList -join ' ')"
        }
    } finally {
        Pop-Location
    }
}

function Assert-PowerShellScriptSyntax {
    param([Parameter(Mandatory = $true)] [string[]]$ScriptPaths)

    foreach ($scriptPath in $ScriptPaths) {
        $parseTokens = $null
        $parseErrors = $null
        [System.Management.Automation.Language.Parser]::ParseFile(
            $scriptPath,
            [ref]$parseTokens,
            [ref]$parseErrors
        ) | Out-Null

        if ($parseErrors.Count -gt 0) {
            $messages = @($parseErrors | ForEach-Object {
                "$($_.Extent.StartLineNumber):$($_.Extent.StartColumnNumber) $($_.Message)"
            })
            throw "PowerShell syntax errors in ${scriptPath}: $($messages -join '; ')"
        }
    }
}

function Get-ManifestHosts {
    param([Parameter(Mandatory = $true)] [xml]$ManifestXml)
    return @($ManifestXml.OfficeApp.Hosts.Host | ForEach-Object { $_.Name })
}

function Assert-ManifestHosts {
    param(
        [Parameter(Mandatory = $true)] [xml]$ManifestXml,
        [Parameter(Mandatory = $true)] [string]$Description
    )

    $hostNames = Get-ManifestHosts $ManifestXml
    foreach ($requiredHost in @("Document", "Presentation")) {
        if ($hostNames -notcontains $requiredHost) {
            throw "$Description manifest missing host: $requiredHost"
        }
    }
}

function Assert-HttpsUrl {
    param(
        [Parameter(Mandatory = $true)] [string]$Value,
        [Parameter(Mandatory = $true)] [string]$Description,
        [switch]$AllowGitHub
    )

    try {
        $uri = [System.Uri]$Value
    } catch {
        throw "$Description must be a valid HTTPS URL: $Value"
    }

    if ($uri.Scheme -ne "https") {
        throw "$Description must use HTTPS: $Value"
    }
    if ($uri.Host -match '^(localhost|127\.0\.0\.1)$') {
        throw "$Description must not use localhost in the production manifest: $Value"
    }
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$addinPath = Resolve-RepoPath $OfficeAddinsRoot
$frontendPath = Resolve-RepoPath $FrontendRoot
$manifestPath = Join-Path $addinPath "manifest.xml"
$devManifestPath = Join-Path $addinPath "manifest.dev.xml"
$prodManifestPath = Join-Path $addinPath "manifest.prod.xml"
$manualGatePath = Join-Path $addinPath "MANUAL_RELEASE_GATES.md"
$packageTool = Join-Path $addinPath "tools\package-office-addin.mjs"
$serveTool = Join-Path $addinPath "tools\serve-office-addin.mjs"

if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "Office add-in manifest not found: $manifestPath"
}
if (-not (Test-Path -LiteralPath $devManifestPath)) {
    throw "Office add-in development manifest not found: $devManifestPath"
}
if (-not (Test-Path -LiteralPath $prodManifestPath)) {
    throw "Office add-in production manifest not found: $prodManifestPath"
}
if (-not (Test-Path -LiteralPath $manualGatePath)) {
    throw "Office add-ins manual release gate document not found: $manualGatePath"
}
if (-not (Test-Path -LiteralPath $packageTool)) {
    throw "Office add-in package tool not found: $packageTool"
}
if (-not (Test-Path -LiteralPath $serveTool)) {
    throw "Office add-in HTTPS host tool not found: $serveTool"
}

$manifestXml = [xml](Get-Content -LiteralPath $manifestPath -Raw)
$manifestText = Get-Content -LiteralPath $manifestPath -Raw
$devManifestText = Get-Content -LiteralPath $devManifestPath -Raw
$devManifestXml = [xml](Get-Content -LiteralPath $devManifestPath -Raw)
$prodManifestText = Get-Content -LiteralPath $prodManifestPath -Raw
$prodManifestXml = [xml]$prodManifestText
$results = [ordered]@{}
$results.Version = [string]$manifestXml.OfficeApp.Version
$results.ReleaseVersion = if ($ReleaseVersion) { $ReleaseVersion } else { $results.Version }

foreach ($manifestInfo in @(
    @{ Description = "generated"; Xml = $manifestXml; Text = $manifestText },
    @{ Description = "development"; Xml = $devManifestXml; Text = $devManifestText },
    @{ Description = "production"; Xml = $prodManifestXml; Text = $prodManifestText }
)) {
    if ($manifestInfo.Text -notmatch '^\s*<\?xml version="1\.0" encoding="utf-8"') {
        throw "$($manifestInfo.Description) manifest XML declaration must declare utf-8 to match the source-controlled bytes."
    }
    $manifestVersion = [string]$manifestInfo.Xml.OfficeApp.Version
    if ($manifestVersion -ne $results.ReleaseVersion) {
        throw "$($manifestInfo.Description) manifest version must equal release version $($results.ReleaseVersion): $manifestVersion"
    }
    if ($manifestInfo.Xml.OfficeApp.Requirements) {
        throw "$($manifestInfo.Description) manifest must not declare a broad Requirements block; it prevents Word and PowerPoint shared-folder sideload discovery."
    }
    Assert-ManifestHosts $manifestInfo.Xml $manifestInfo.Description
}

if ($manifestXml.OfficeApp.Permissions -ne "ReadWriteDocument") {
    throw "Office add-in manifest must request ReadWriteDocument for selected-text replacement."
}
$sourceLocation = [string]$manifestXml.OfficeApp.DefaultSettings.SourceLocation.DefaultValue
if (-not $sourceLocation.StartsWith("https://localhost:", [StringComparison]::OrdinalIgnoreCase)) {
    throw "Office add-in SourceLocation must use localhost HTTPS for sideload foundation."
}
if ($prodManifestText -match '(?i)(localhost|127\.0\.0\.1)') {
    throw "Office add-in production manifest must not contain localhost or 127.0.0.1."
}
$prodSourceLocation = [string]$prodManifestXml.OfficeApp.DefaultSettings.SourceLocation.DefaultValue
$prodSupportUrl = [string]$prodManifestXml.OfficeApp.SupportUrl.DefaultValue
$prodPrivacyUrl = [string]$prodManifestXml.OfficeApp.PrivacyUrl.DefaultValue
$prodIconUrl = [string]$prodManifestXml.OfficeApp.IconUrl.DefaultValue
$prodHighIconUrl = [string]$prodManifestXml.OfficeApp.HighResolutionIconUrl.DefaultValue
Assert-HttpsUrl $prodSourceLocation "Production SourceLocation"
Assert-HttpsUrl $prodSupportUrl "Production SupportUrl"
Assert-HttpsUrl $prodPrivacyUrl "Production PrivacyUrl"
Assert-HttpsUrl $prodIconUrl "Production IconUrl"
Assert-HttpsUrl $prodHighIconUrl "Production HighResolutionIconUrl"
$results.ProductionManifest = "passed"

$readmeText = Get-Content -LiteralPath (Join-Path $addinPath "README.md") -Raw
$validationText = Get-Content -LiteralPath (Join-Path $RepoRoot "docs\testing\office-addins-v0.8-validation.md") -Raw
foreach ($hostClaim in @("Word", "PowerPoint")) {
    if (-not $readmeText.Contains($hostClaim) -or -not $validationText.Contains($hostClaim)) {
        throw "Office add-ins package docs must mention claimed host: $hostClaim"
    }
}
$results.HostClaimsMatchDocs = "passed"
$manualGateText = Get-Content -LiteralPath $manualGatePath -Raw
foreach ($requiredGateText in @(
    "Gate 1: Fresh Local Preflight",
    "Gate 2: Local HTTPS Task-Pane Host",
    "Gate 3: Word Sideload Flow",
    "Gate 4: PowerPoint Sideload Flow",
    "Gate 5: Accessibility And Keyboard Smoke",
    "Decision: Sideload QA approved"
)) {
    if (-not $manualGateText.Contains($requiredGateText)) {
        throw "Office add-ins manual release gate document missing required text: $requiredGateText"
    }
}
$results.ManualGateDocument = "passed"

if (-not $SkipPackageTests) {
    Invoke-Checked "npm" @(
        "test",
        "--",
        "officeAddinsPackage.test.js",
        "--minWorkers=1",
        "--maxWorkers=2",
        "--reporter=dot"
    ) $frontendPath
    $results.PackageTests = "passed"
} else {
    $results.PackageTests = "skipped"
}

Invoke-Checked "node" @("--check", $packageTool) $RepoRoot
$results.PackageToolSyntax = "passed"
Invoke-Checked "node" @("--check", $serveTool) $RepoRoot
$results.HttpsHostToolSyntax = "passed"

$releaseScriptPaths = [string[]]@(
    (Join-Path $PSScriptRoot "check-office-addins-manual-qa-report.ps1"),
    (Join-Path $PSScriptRoot "New-OfficeAddinDevCertificate.ps1"),
    (Join-Path $PSScriptRoot "new-office-addins-manual-qa-report.ps1"),
    (Join-Path $PSScriptRoot "package-office-addins.ps1"),
    (Join-Path $PSScriptRoot "qa-office-addins-whiteknight-powerpoint-sideload.ps1"),
    (Join-Path $PSScriptRoot "qa-office-addins-whiteknight-word-sideload.ps1"),
    (Join-Path $PSScriptRoot "serve-office-addins.ps1"),
    (Join-Path $PSScriptRoot "validate-office-addins-release.ps1")
)
Assert-PowerShellScriptSyntax $releaseScriptPaths
$results.PowerShellReleaseScriptSyntax = "passed"

$expectedEntries = [string[]](node $packageTool $addinPath | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0) {
    throw "Office add-in package entry listing failed."
}
$results.ExpectedEntries = $expectedEntries

$packageJson = & (Join-Path $PSScriptRoot "package-office-addins.ps1") -OfficeAddinsRoot $OfficeAddinsRoot
if ($LASTEXITCODE -ne 0) {
    throw "Office add-ins package script failed."
}
$packageResult = $packageJson | ConvertFrom-Json
$zipPath = $packageResult.Package
if (-not (Test-Path -LiteralPath $zipPath)) {
    throw "Office add-ins package zip not found after build: $zipPath"
}
$results.Package = $zipPath

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $actualEntries = @($archive.Entries | ForEach-Object { $_.FullName -replace '\\', '/' } | Sort-Object)
} finally {
    $archive.Dispose()
}
$sortedExpectedEntries = @($expectedEntries | Sort-Object)
$missingEntries = @($sortedExpectedEntries | Where-Object { $actualEntries -notcontains $_ })
$extraEntries = @($actualEntries | Where-Object { $sortedExpectedEntries -notcontains $_ })
if ($missingEntries.Count -gt 0 -or $extraEntries.Count -gt 0) {
    throw "Office add-ins package zip entries differ from expected entries. Missing=$($missingEntries -join ', ') Extra=$($extraEntries -join ', ')"
}
$results.ZipEntries = $actualEntries

[pscustomobject]$results | ConvertTo-Json -Depth 6
