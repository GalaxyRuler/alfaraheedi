param(
    [string]$LocalArtifactRoot = "dist\desktop-overlay-whiteknight-qa",
    [string]$RunLabel = "v2b-desktop-overlay",
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
    Privacy = "Do not include raw text, account data, tokens, private screenshots, clipboard contents, or private window titles."
    ProbePayloadPolicy = "Sanitized metadata only: support, focused_control, text_pattern_supported, visible_range_rect_count, value_pattern_supported, replacement_supported, control_class, monitor_present."
    Targets = $targets
    Status = if ($StageOnly) { "stage_only_ready" } else { "blocked_pending_interactive_whiteknight_execution" }
}

$manifestPath = Join-Path $runRoot "desktop-overlay-whiteknight-manifest.json"
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding utf8

$readmePath = Join-Path $runRoot "README.md"
@"
# Nahou V2B Desktop Overlay WhiteKnight QA

This artifact is a public-safe metadata template for the probe-only V2B desktop
overlay spike.

Command under review: ``probe_desktop_overlay``

Do not include raw text, account data, tokens, private screenshots, clipboard
contents, or private window titles.

Real WhiteKnight evidence must record only support classification, rectangle
counts, capability labels, hashes, timestamps, and public fixture names.
"@ | Set-Content -LiteralPath $readmePath -Encoding utf8

$manifest | ConvertTo-Json -Depth 8
