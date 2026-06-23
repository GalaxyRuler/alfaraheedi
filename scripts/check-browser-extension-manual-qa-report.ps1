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
$completed = $false

if ($reportExists) {
    $reportText = Get-Content -LiteralPath $manualQaReport.FullName -Raw
    $gateHashMatches = $reportText.Contains("Gate source SHA256: $gateHash")
    $decisionMatch = [regex]::Match($reportText, '(?m)^Decision:\s*(.+?)\s*$')
    if ($decisionMatch.Success) {
        $releaseDecision = $decisionMatch.Groups[1].Value.Trim()
    }
    $hasTodo = $reportText -match '\bTODO\b'
    $completed = [bool](
        $gateHashMatches -and
        -not $hasTodo -and
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
    ReleaseDecision = $releaseDecision
    Completed = $completed
}

$result | ConvertTo-Json -Depth 4

if ($RequireCompleted -and -not $completed) {
    throw "Browser extension manual QA report is not complete."
}
