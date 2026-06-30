param(
    [string]$Remote = "codex-whiteknight",
    [string]$RunAsUser = "WHITEKNIGHT\aoa",
    [string]$RemoteArtifactRoot = "C:\AgentArtifacts\nahou-office-whiteknight",
    [string]$LocalArtifactRoot = "dist\office-addins-whiteknight-qa",
    [string]$HomelabRoot = "C:\CodexProjects\new-project-3",
    [string]$WriteCliPath = "target\release\writecheck.exe",
    [int]$TimeoutSeconds = 420,
    [switch]$SkipCargoBuild,
    [switch]$SkipReadinessGates,
    [switch]$SkipDesktopPrepare,
    [switch]$StageOnly,
    [switch]$AllowBlocked
)

$ErrorActionPreference = "Stop"

& (Join-Path $PSScriptRoot "qa-office-addins-whiteknight-word-sideload.ps1") `
    -HostApp PowerPoint `
    -Remote $Remote `
    -RunAsUser $RunAsUser `
    -RemoteArtifactRoot $RemoteArtifactRoot `
    -LocalArtifactRoot $LocalArtifactRoot `
    -HomelabRoot $HomelabRoot `
    -WriteCliPath $WriteCliPath `
    -TimeoutSeconds $TimeoutSeconds `
    -SkipCargoBuild:$SkipCargoBuild `
    -SkipReadinessGates:$SkipReadinessGates `
    -SkipDesktopPrepare:$SkipDesktopPrepare `
    -StageOnly:$StageOnly `
    -AllowBlocked:$AllowBlocked
