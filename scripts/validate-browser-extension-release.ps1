param(
    [string]$ExtensionRoot = "browser-extension",

    [string]$FrontendRoot = "frontend",

    [switch]$SkipPackageTests,

    [switch]$RunVmSmokes,

    [string]$VmName = "",

    [string]$CredentialPath = "",

    [string]$ChromeForTestingZipPath = ""
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

function Invoke-CheckedJson {
    param(
        [Parameter(Mandatory = $true)] [string]$FilePath,
        [Parameter(Mandatory = $true)] [string[]]$ArgumentList,
        [Parameter(Mandatory = $true)] [string]$StepName,
        [string]$WorkingDirectory = $script:RepoRoot
    )

    Push-Location $WorkingDirectory
    try {
        $commandOutput = & $FilePath @ArgumentList 2>&1
        if ($LASTEXITCODE -ne 0) {
            $outputText = ($commandOutput | Out-String).Trim()
            throw "$StepName failed with exit code ${LASTEXITCODE}. Output=$outputText"
        }

        return ConvertFrom-CommandJson $commandOutput $StepName
    } finally {
        Pop-Location
    }
}

function Assert-StoreAssetManifest {
    param([Parameter(Mandatory = $true)] [string]$ExtensionPath)

    $assetManifestPath = Join-Path $ExtensionPath "STORE_ASSETS.md"
    if (-not (Test-Path -LiteralPath $assetManifestPath)) {
        throw "Store asset manifest not found: $assetManifestPath"
    }

    $assetManifest = Get-Content -LiteralPath $assetManifestPath -Raw
    foreach ($requiredText in @(
        "01-options-settings.png",
        "02-popup-status.png",
        "03-web-field-suggestions.png",
        "1280x800",
        "Do not imply live Gmail, WhatsApp Web, Google Docs",
        "Do not show private user text",
        "PRIVACY_POLICY.md",
        "STORE_SUBMISSION.md"
    )) {
        if (-not $assetManifest.Contains($requiredText)) {
            throw "Store asset manifest missing required text: $requiredText"
        }
    }
}

function Assert-PublicPrivacyPage {
    param([Parameter(Mandatory = $true)] [string]$RepoRoot)

    $publicPrivacyPath = Join-Path $RepoRoot "docs\public\browser-extension\privacy.html"
    if (-not (Test-Path -LiteralPath $publicPrivacyPath)) {
        throw "Public browser extension privacy page not found: $publicPrivacyPath"
    }

    $publicPrivacyPage = Get-Content -LiteralPath $publicPrivacyPath -Raw
    foreach ($requiredText in @(
        "Alfaraheedi Browser Extension Privacy Policy",
        "Last updated: 2026-06-22",
        "local loopback Alfaraheedi API",
        "does not send text to Alfaraheedi-hosted services",
        "does not store captured editor text",
        "does not use telemetry",
        "does not load or execute remote code",
        "No Alfaraheedi operator or reviewer receives or reads user editor text"
    )) {
        if (-not $publicPrivacyPage.Contains($requiredText)) {
            throw "Public privacy page missing required text: $requiredText"
        }
    }
}

function Assert-ManualReleaseGates {
    param([Parameter(Mandatory = $true)] [string]$RepoRoot)

    $manualGatePath = Join-Path $RepoRoot "browser-extension\MANUAL_RELEASE_GATES.md"
    $manualReportScript = Join-Path $RepoRoot "scripts\new-browser-extension-manual-qa-report.ps1"
    if (-not (Test-Path -LiteralPath $manualGatePath)) {
        throw "Manual browser extension release gates not found: $manualGatePath"
    }
    if (-not (Test-Path -LiteralPath $manualReportScript)) {
        throw "Manual browser extension QA report generator not found: $manualReportScript"
    }

    $manualGateDoc = Get-Content -LiteralPath $manualGatePath -Raw
    foreach ($requiredText in @(
        "Fresh Automated Release Preflight",
        "Public Privacy URL",
        "Live Production Editors",
        "Manual Screen-Reader And Keyboard Review",
        "Store Dashboard Review",
        "Gmail compose",
        "WhatsApp Web composer",
        "Google Docs",
        "Windows Narrator",
        "Do not include private emails, chats, document text, account names",
        "Store listing copy implies unsupported production editors"
    )) {
        if (-not $manualGateDoc.Contains($requiredText)) {
            throw "Manual release gate document missing required text: $requiredText"
        }
    }

    $manualReportSource = Get-Content -LiteralPath $manualReportScript -Raw
    foreach ($requiredText in @(
        "browser-extension\MANUAL_RELEASE_GATES.md",
        "dist\browser-extension-manual-qa",
        "Gate source SHA256",
        "helo wat you are do?",
        "Do not include private emails, chats, document text",
        "GateSourceSha256",
        "Assert-PathUnderRepo"
    )) {
        if (-not $manualReportSource.Contains($requiredText)) {
            throw "Manual QA report generator missing required text: $requiredText"
        }
    }
}

function Assert-PublicReleaseHygiene {
    $hygieneJson = & (Join-Path $PSScriptRoot "check-public-release-hygiene.ps1") -RequireClean
    if ($LASTEXITCODE -ne 0) {
        throw "Public release hygiene check failed."
    }

    $hygieneResult = $hygieneJson | ConvertFrom-Json
    if (-not $hygieneResult.PublicReleaseHygieneReady) {
        throw "Public release hygiene check did not report ready."
    }

    return $hygieneResult
}

function Assert-PowerShellScriptSyntax {
    param([Parameter(Mandatory = $true)] [string[]]$ScriptPaths)

    foreach ($scriptPath in $ScriptPaths) {
        if (-not (Test-Path -LiteralPath $scriptPath)) {
            throw "Release script not found: $scriptPath"
        }

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

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$extensionPath = Resolve-RepoPath $ExtensionRoot
$frontendPath = Resolve-RepoPath $FrontendRoot
$manifestPath = Join-Path $extensionPath "manifest.json"
$packageTool = Join-Path $extensionPath "tools\package-extension.mjs"

if (-not (Test-Path -LiteralPath $extensionPath)) {
    throw "Extension root not found: $extensionPath"
}
if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "Extension manifest not found: $manifestPath"
}
if (-not (Test-Path -LiteralPath $frontendPath)) {
    throw "Frontend root not found: $frontendPath"
}
if (-not (Test-Path -LiteralPath $packageTool)) {
    throw "Package tool not found: $packageTool"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$results = [ordered]@{}
$results.Version = $manifest.version

if (-not $SkipPackageTests) {
    Invoke-Checked "npm" @(
        "test",
        "--",
        "browserExtension.test.js",
        "browserExtensionSettings.test.js",
        "browserExtensionPackage.test.js",
        "--minWorkers=1",
        "--maxWorkers=2",
        "--reporter=dot"
    ) $frontendPath
    $results.PackageTests = "passed"
    $results.ExtensionRuntimeTests = "passed"
} else {
    $results.PackageTests = "skipped"
    $results.ExtensionRuntimeTests = "skipped"
}

Invoke-Checked "node" @("--check", $packageTool) $RepoRoot
$results.PackageToolSyntax = "passed"

$releaseScriptPaths = [string[]]@(
    (Join-Path $PSScriptRoot "check-public-release-hygiene.ps1"),
    (Join-Path $PSScriptRoot "export-browser-extension-release-handoff.ps1"),
    (Join-Path $PSScriptRoot "prepare-browser-extension-release-candidate.ps1"),
    (Join-Path $PSScriptRoot "package-browser-extension.ps1"),
    (Join-Path $PSScriptRoot "export-browser-extension-store-submission.ps1"),
    (Join-Path $PSScriptRoot "check-browser-extension-store-submission-integrity.ps1"),
    (Join-Path $PSScriptRoot "get-browser-extension-release-readiness.ps1"),
    (Join-Path $PSScriptRoot "check-browser-extension-manual-qa-report.ps1"),
    (Join-Path $PSScriptRoot "check-browser-extension-pages-readiness.ps1"),
    (Join-Path $PSScriptRoot "check-browser-extension-public-privacy-url.ps1"),
    (Join-Path $PSScriptRoot "new-browser-extension-manual-qa-report.ps1"),
    (Join-Path $PSScriptRoot "qa-browser-extension-ax-smoke.ps1"),
    (Join-Path $PSScriptRoot "qa-browser-extension-production-editors-smoke.ps1"),
    (Join-Path $PSScriptRoot "capture-browser-extension-store-screenshots.ps1"),
    (Join-Path $PSScriptRoot "qa-browser-extension-keyboard-flow-smoke.ps1")
)
Assert-PowerShellScriptSyntax $releaseScriptPaths
$results.PowerShellReleaseScriptSyntax = "passed"

$expectedEntries = [string[]](node $packageTool $extensionPath | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0) {
    throw "Package entry listing failed."
}
if (-not ($expectedEntries -contains "PRIVACY_POLICY.md")) {
    throw "PRIVACY_POLICY.md must be included in the browser extension package."
}
$results.ExpectedEntries = $expectedEntries

Assert-StoreAssetManifest $extensionPath
$results.StoreAssetManifest = "passed"

Assert-PublicPrivacyPage $RepoRoot
$results.PublicPrivacyPage = "passed"

Assert-ManualReleaseGates $RepoRoot
$results.ManualReleaseGates = "passed"

$results.PublicReleaseHygiene = Assert-PublicReleaseHygiene

$packageJson = & (Join-Path $PSScriptRoot "package-browser-extension.ps1") -ExtensionRoot $ExtensionRoot
if ($LASTEXITCODE -ne 0) {
    throw "Browser extension package script failed."
}
$packageResult = $packageJson | ConvertFrom-Json
$zipPath = $packageResult.Package
if (-not (Test-Path -LiteralPath $zipPath)) {
    throw "Package zip not found after build: $zipPath"
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
    throw "Package zip entries differ from expected entries. Missing=$($missingEntries -join ', ') Extra=$($extraEntries -join ', ')"
}
$results.ZipEntries = $actualEntries

if ($RunVmSmokes) {
    if (-not $VmName -or -not $CredentialPath) {
        throw "-RunVmSmokes requires -VmName and -CredentialPath."
    }

    $axSmokeScript = Join-Path $PSScriptRoot "qa-browser-extension-ax-smoke.ps1"
    $results.EdgeAccessibilityTreeSmoke = Invoke-CheckedJson "powershell" @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        $axSmokeScript,
        "-VmName",
        $VmName,
        "-CredentialPath",
        $CredentialPath,
        "-ZipPath",
        $zipPath
    ) "Edge Accessibility Tree smoke" $RepoRoot

    $productionEditorSmokeScript = Join-Path $PSScriptRoot "qa-browser-extension-production-editors-smoke.ps1"
    $results.EdgeProductionEditorsSmoke = Invoke-CheckedJson "powershell" @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        $productionEditorSmokeScript,
        "-VmName",
        $VmName,
        "-CredentialPath",
        $CredentialPath,
        "-ZipPath",
        $zipPath
    ) "Edge production-editor fixture smoke" $RepoRoot

    $storeScreenshotScript = Join-Path $PSScriptRoot "capture-browser-extension-store-screenshots.ps1"
    $results.EdgeStoreScreenshots = Invoke-CheckedJson "powershell" @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        $storeScreenshotScript,
        "-VmName",
        $VmName,
        "-CredentialPath",
        $CredentialPath,
        "-ZipPath",
        $zipPath
    ) "Edge store screenshot capture" $RepoRoot

    $smokeScript = Join-Path $PSScriptRoot "qa-browser-extension-keyboard-flow-smoke.ps1"
    $results.EdgeKeyboardSmoke = Invoke-CheckedJson "powershell" @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        $smokeScript,
        "-VmName",
        $VmName,
        "-CredentialPath",
        $CredentialPath,
        "-ZipPath",
        $zipPath,
        "-Browser",
        "Edge"
    ) "Edge keyboard-flow smoke" $RepoRoot

    if ($ChromeForTestingZipPath) {
        $results.ChromeForTestingKeyboardSmoke = Invoke-CheckedJson "powershell" @(
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            $smokeScript,
            "-VmName",
            $VmName,
            "-CredentialPath",
            $CredentialPath,
            "-ZipPath",
            $zipPath,
            "-Browser",
            "ChromeForTesting",
            "-ChromeForTestingZipPath",
            (Resolve-RepoPath $ChromeForTestingZipPath)
        ) "Chrome for Testing keyboard-flow smoke" $RepoRoot
    } else {
        $results.ChromeForTestingKeyboardSmoke = "skipped: no ChromeForTestingZipPath"
    }
} else {
    $results.VmSmokes = "skipped"
}

[pscustomobject]$results | ConvertTo-Json -Depth 8
