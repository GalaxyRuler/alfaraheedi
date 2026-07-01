param(
    [string]$LocalArtifactRoot = "dist\desktop-overlay-whiteknight-qa",
    [string]$RunLabel = "v2b-desktop-overlay",
    [string]$BinaryPath = "target\debug\alfaraheedi.exe",
    [string]$ObservedTargetApp = "FocusedControl",
    [string]$ObservedFixture = "public-safe-focused-control",
    [string[]]$AllowedSupport = @(),
    [switch]$SkipBuild,
    [switch]$StageOnly
)

$ErrorActionPreference = "Stop"

$script:RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

function Resolve-RepoPath {
    param([Parameter(Mandatory = $true)] [string]$Path)
    if ([IO.Path]::IsPathRooted($Path)) {
        return $Path
    }
    return Join-Path $script:RepoRoot $Path
}

$artifactRoot = Resolve-RepoPath $LocalArtifactRoot
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runRoot = Join-Path $artifactRoot "$RunLabel-$timestamp"
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

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

function Assert-PublicSafeProbeJson {
    param([Parameter(Mandatory = $true)] [string]$JsonText)

    foreach ($forbidden in @(
        "raw_text",
        "captured_text",
        "current_text",
        "selected_text",
        "clipboard_content",
        "window_title",
        "document_name"
    )) {
        if ($JsonText.Contains($forbidden)) {
            throw "Desktop overlay probe JSON contains forbidden field marker: $forbidden"
        }
    }
}

$targets = @(
    @{
        App = "Notepad"
        Fixture = "public-safe-notepad-edit"
        ExpectedClassification = "supported_or_fallback"
    },
    @{
        App = "Word"
        Fixture = "public-safe-word-document-body"
        ExpectedClassification = "supported_or_fallback"
    },
    @{
        App = "PowerPoint"
        Fixture = "public-safe-powerpoint-text-box"
        ExpectedClassification = "supported_or_fallback"
    },
    @{
        App = "EdgeOrChrome"
        Fixture = "public-safe-browser-text-field"
        ExpectedClassification = "fallback"
    },
    @{
        App = "Electron"
        Fixture = "public-safe-electron-text-field"
        ExpectedClassification = "fallback_or_blocked"
    },
    @{
        App = "PasswordLikeControl"
        Fixture = "no-text-sensitive-control-class"
        ExpectedClassification = "unsafe"
    }
)

$manifest = [ordered]@{
    GeneratedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    RepoRoot = $script:RepoRoot.Path
    RunRoot = $runRoot
    Command = "probe_desktop_overlay"
    Mode = if ($StageOnly) { "stage_only" } else { "metadata_template" }
    ObservedTargetApp = $ObservedTargetApp
    ObservedFixture = $ObservedFixture
    AllowedSupport = $AllowedSupport
    Privacy = "Do not include raw text, account data, tokens, private screenshots, clipboard contents, or private window titles."
    ProbePayloadPolicy = "Sanitized metadata only: support, focused_control, text_pattern_supported, visible_range_rect_count, value_pattern_supported, replacement_supported, control_class, monitor_present."
    Targets = $targets
    Status = if ($StageOnly) { "stage_only_ready" } else { "blocked_pending_interactive_whiteknight_execution" }
}

if (-not $StageOnly) {
    if (-not $SkipBuild) {
        Invoke-Checked `
            -FilePath "cargo" `
            -ArgumentList @("build", "-p", "alfaraheedi-desktop", "--bin", "alfaraheedi")
    }

    $binary = Resolve-RepoPath $BinaryPath
    if (-not (Test-Path -LiteralPath $binary)) {
        throw "Desktop binary was not found: $binary"
    }

    $probeOutput = & $binary --qa-probe-desktop-overlay 2>&1
    $exitCode = $LASTEXITCODE
    $probeText = ($probeOutput | Out-String).Trim()
    if ($exitCode -ne 0) {
        throw "Desktop overlay probe command failed with exit code ${exitCode}: $probeText"
    }

    Assert-PublicSafeProbeJson -JsonText $probeText
    $probe = $probeText | ConvertFrom-Json
    $support = [string]$probe.support
    $supportAllowed = $true
    if ($AllowedSupport.Count -gt 0) {
        $supportAllowed = $AllowedSupport -contains $support
        if (-not $supportAllowed) {
            throw "Desktop overlay probe support '$support' was not in the allowed set for ${ObservedTargetApp}: $($AllowedSupport -join ', ')"
        }
    }

    $probePath = Join-Path $runRoot "probe-desktop-overlay.json"
    $probeText | Set-Content -LiteralPath $probePath -Encoding utf8

    $manifest.Mode = "probe_executed"
    $manifest.Status = "probe_metadata_captured"
    $manifest.ProbeCommand = "$binary --qa-probe-desktop-overlay"
    $manifest.ProbeResult = @{
        Path = $probePath
        Support = $support
        SupportAllowed = $supportAllowed
        Method = $probe.method
        VisibleRangeRectCount = $probe.visible_range_rect_count
        ReplacementSupported = $probe.replacement_supported
        MonitorPresent = $probe.monitor_present
        TextPatternSupported = $probe.text_pattern_supported
        ValuePatternSupported = $probe.value_pattern_supported
        ControlClass = $probe.control_class
    }
}

$manifestPath = Join-Path $runRoot "desktop-overlay-whiteknight-manifest.json"
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding utf8

$readmePath = Join-Path $runRoot "README.md"
@"
# Nahou V2B Desktop Overlay WhiteKnight QA

This artifact is a public-safe metadata template for the probe-only V2B desktop
overlay spike.

Command under review: ``probe_desktop_overlay``

CLI evidence command: ``--qa-probe-desktop-overlay``

Focused-target evidence flags: ``-ObservedTargetApp``, ``-ObservedFixture``,
and ``-AllowedSupport``.

Do not include raw text, account data, tokens, private screenshots, clipboard
contents, or private window titles.

Real WhiteKnight evidence must record only support classification, rectangle
counts, capability labels, hashes, timestamps, and public fixture names.
"@ | Set-Content -LiteralPath $readmePath -Encoding utf8

$manifest | ConvertTo-Json -Depth 8
