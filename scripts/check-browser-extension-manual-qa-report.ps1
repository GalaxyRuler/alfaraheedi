param(
    [string]$ManualQaRoot = "dist\browser-extension-manual-qa",

    [string]$ReportPath = "",

    [string]$GatePath = "browser-extension\MANUAL_RELEASE_GATES.md",

    [switch]$RequireCompleted
)

$ErrorActionPreference = "Stop"

function Resolve-RepoPath {
    param([Parameter(Mandatory = $true)] [string]$Path)
    if ([IO.Path]::IsPathRooted($Path)) {
        return $Path
    }
    return Join-Path $script:RepoRoot $Path
}

function Get-LatestManualQaReport {
    param([Parameter(Mandatory = $true)] [string]$Root)

    if (-not (Test-Path -LiteralPath $Root)) {
        return $null
    }

    return Get-ChildItem -LiteralPath $Root -Filter "*.md" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$resolvedGatePath = Resolve-RepoPath $GatePath
if (-not (Test-Path -LiteralPath $resolvedGatePath)) {
    throw "Manual release gate document not found: $resolvedGatePath"
}

$resolvedManualQaRoot = Resolve-RepoPath $ManualQaRoot
$manualQaReport = if ($ReportPath) {
    $resolvedReportPath = Resolve-RepoPath $ReportPath
    if (Test-Path -LiteralPath $resolvedReportPath) {
        Get-Item -LiteralPath $resolvedReportPath
    } else {
        $null
    }
} else {
    Get-LatestManualQaReport $resolvedManualQaRoot
}

$gateHash = (Get-FileHash -LiteralPath $resolvedGatePath -Algorithm SHA256).Hash
$reportExists = $null -ne $manualQaReport
$gateHashMatches = $false
$releaseDecision = ""
$hasTodo = $false
$publicSafeConfirmed = $false
$requiredV2CoveragePresent = $false
$completed = $false
$requiredV2CoverageTokens = @(
    "Controlled Fixture Coverage",
    "textarea",
    "text-input",
    "simple-contenteditable",
    "shadow-dom",
    "iframe",
    "repeated-text",
    "RTL/mixed text",
    "large text refusal",
    "sensitive fields",
    "API unavailable",
    "paused/site-disabled",
    "keyboard-only card flow",
    "accessibility scan",
    "Real-Site Manual Coverage",
    "Gmail compose",
    "WhatsApp Web composer",
    "Google Docs",
    "Plain contenteditable site",
    "Framework-heavy editor",
    "WhiteKnight Evidence"
)

if ($reportExists) {
    $reportText = Get-Content -LiteralPath $manualQaReport.FullName -Raw
    $gateHashMatches = $reportText.Contains("Gate source SHA256: $gateHash")
    $decisionMatch = [regex]::Match($reportText, '(?m)^Decision:\s*(.+?)\s*$')
    if ($decisionMatch.Success) {
        $releaseDecision = $decisionMatch.Groups[1].Value.Trim()
    }
    $hasTodo = $reportText -match '\bTODO\b'
    $publicSafeConfirmed = [bool](
        $reportText -match '(?m)^Public-safe artifact check:\s*Pass\s*$' -and
        $reportText -match '(?m)^Privacy check:\s*Pass'
    )
    $requiredV2CoveragePresent = -not @(
        $requiredV2CoverageTokens | Where-Object { -not $reportText.Contains($_) }
    )
    $completed = [bool](
        $gateHashMatches -and
        -not $hasTodo -and
        $publicSafeConfirmed -and
        $requiredV2CoveragePresent -and
        $releaseDecision -eq "Public release approved"
    )
}

$result = [pscustomobject]@{
    Report = if ($reportExists) { $manualQaReport.FullName } else { $null }
    GateSource = $resolvedGatePath
    GateSourceSha256 = $gateHash
    ReportExists = $reportExists
    GateHashMatches = $gateHashMatches
    HasTodo = $hasTodo
    PublicSafeConfirmed = $publicSafeConfirmed
    RequiredV2CoveragePresent = $requiredV2CoveragePresent
    ReleaseDecision = $releaseDecision
    Completed = $completed
}

$result | ConvertTo-Json -Depth 4

if ($RequireCompleted -and -not $completed) {
    throw "Browser extension manual QA report is not complete."
}
