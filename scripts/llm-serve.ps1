param(
    [Parameter(Mandatory = $true)]
    [string]$ModelPath,
    [string]$LlamaServerPath = "llama-server",
    [string]$HostName = "127.0.0.1",
    [int]$Port = 8000,
    [int]$ContextSize = 4096,
    [int]$Threads = 0,
    [ValidateRange(1000, 120000)]
    [int]$TimeoutMs = 30000
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$resolvedModel = (Resolve-Path -LiteralPath $ModelPath).Path

if (-not (Get-Command $LlamaServerPath -ErrorAction SilentlyContinue)) {
    throw "Could not find '$LlamaServerPath'. Install llama.cpp and put llama-server on PATH, or pass -LlamaServerPath."
}

$baseUrl = "http://$HostName`:$Port"
$env:ALFARAHEEDI_LLM_BASE_URL = $baseUrl
$env:ALFARAHEEDI_LLM_MODEL = [System.IO.Path]::GetFileNameWithoutExtension($resolvedModel)
$env:ALFARAHEEDI_LLM_TIMEOUT_MS = "$TimeoutMs"

Write-Host "Starting local LLM runtime at $baseUrl"
Write-Host "Set ALFARAHEEDI_LLM_BASE_URL=$baseUrl for writecheck/API processes."
Write-Host "Set ALFARAHEEDI_LLM_MODEL=$env:ALFARAHEEDI_LLM_MODEL for writecheck/API processes."
Write-Host "Set ALFARAHEEDI_LLM_TIMEOUT_MS=$env:ALFARAHEEDI_LLM_TIMEOUT_MS for writecheck/API processes."

$args = @(
    "--model", $resolvedModel,
    "--host", $HostName,
    "--port", "$Port",
    "--ctx-size", "$ContextSize"
)

if ($Threads -gt 0) {
    $args += @("--threads", "$Threads")
}

& $LlamaServerPath @args
