param(
    [string]$ApiAddr = "127.0.0.1:3198",
    [switch]$MockRuntime,
    [int]$MockRuntimePort = 3199,
    [string]$SampleText = "مرحبــا  بالعالم"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Set-ProcessEnv {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [AllowNull()]
        [string]$Value
    )

    [System.Environment]::SetEnvironmentVariable($Name, $Value, "Process")
}

function Invoke-JsonWithRetry {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Uri,
        [ValidateRange(1, 120)]
        [int]$Attempts = 30,
        [AllowNull()]
        [System.Diagnostics.Process]$ProcessToCheck
    )

    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        if ($null -ne $ProcessToCheck -and $ProcessToCheck.HasExited) {
            throw "Process exited early with code $($ProcessToCheck.ExitCode) while waiting for $Uri"
        }

        try {
            return Invoke-RestMethod -Uri $Uri -TimeoutSec 2
        }
        catch {
            if ($attempt -eq $Attempts) {
                throw
            }

            Start-Sleep -Milliseconds 500
        }
    }
}

function Start-HiddenProcess {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [string[]]$ArgumentList = @(),
        [Parameter(Mandatory = $true)]
        [string]$WorkingDirectory,
        [Parameter(Mandatory = $true)]
        [string]$OutputPath,
        [Parameter(Mandatory = $true)]
        [string]$ErrorPath
    )

    $startArgs = @{
        FilePath = $FilePath
        ArgumentList = $ArgumentList
        WorkingDirectory = $WorkingDirectory
        PassThru = $true
        RedirectStandardOutput = $OutputPath
        RedirectStandardError = $ErrorPath
    }

    if ([System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)) {
        $startArgs.WindowStyle = "Hidden"
    }

    Start-Process @startArgs
}

$scriptRoot = Split-Path -Parent $PSCommandPath
$repoRoot = Split-Path -Parent $scriptRoot
$runningOnWindows = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)
$apiExeName = if ($runningOnWindows) { "write-api.exe" } else { "write-api" }
$apiExe = Join-Path (Join-Path $repoRoot "target") (Join-Path "debug" $apiExeName)
$apiBaseUrl = "http://$ApiAddr"
$mockBaseUrl = "http://127.0.0.1:$MockRuntimePort"
$mockOutput = Join-Path ([System.IO.Path]::GetTempPath()) "alfaraheedi-mock-openai.out.log"
$mockError = Join-Path ([System.IO.Path]::GetTempPath()) "alfaraheedi-mock-openai.err.log"
$apiOutput = Join-Path ([System.IO.Path]::GetTempPath()) "alfaraheedi-llm-smoke-api.out.log"
$apiError = Join-Path ([System.IO.Path]::GetTempPath()) "alfaraheedi-llm-smoke-api.err.log"

$originalBaseUrl = [System.Environment]::GetEnvironmentVariable("ALFARAHEEDI_LLM_BASE_URL", "Process")
$originalModel = [System.Environment]::GetEnvironmentVariable("ALFARAHEEDI_LLM_MODEL", "Process")
$originalTimeout = [System.Environment]::GetEnvironmentVariable("ALFARAHEEDI_LLM_TIMEOUT_MS", "Process")
$originalApiAddr = [System.Environment]::GetEnvironmentVariable("WRITECHECK_ADDR", "Process")
$mockProcess = $null
$apiProcess = $null

try {
    if ($MockRuntime) {
        $modelId = if ([string]::IsNullOrWhiteSpace($env:ALFARAHEEDI_LLM_MODEL)) {
            "mock-local-model"
        }
        else {
            $env:ALFARAHEEDI_LLM_MODEL
        }

        Set-ProcessEnv -Name "ALFARAHEEDI_LLM_BASE_URL" -Value $mockBaseUrl
        Set-ProcessEnv -Name "ALFARAHEEDI_LLM_MODEL" -Value $modelId

        $mockScript = Join-Path $scriptRoot "mock-openai-server.mjs"
        $mockProcess = Start-HiddenProcess `
            -FilePath "node" `
            -ArgumentList @($mockScript, "--port", "$MockRuntimePort", "--model", $modelId) `
            -WorkingDirectory $repoRoot `
            -OutputPath $mockOutput `
            -ErrorPath $mockError

        $null = Invoke-JsonWithRetry -Uri "$mockBaseUrl/v1/models" -ProcessToCheck $mockProcess
    }
    elseif ([string]::IsNullOrWhiteSpace($env:ALFARAHEEDI_LLM_BASE_URL)) {
        Write-Output "LLM smoke skipped: set ALFARAHEEDI_LLM_BASE_URL or pass -MockRuntime."
        exit 0
    }

    cargo build -p write-api

    Set-ProcessEnv -Name "WRITECHECK_ADDR" -Value $ApiAddr
    $apiProcess = Start-HiddenProcess `
        -FilePath $apiExe `
        -WorkingDirectory $repoRoot `
        -OutputPath $apiOutput `
        -ErrorPath $apiError

    $health = Invoke-JsonWithRetry -Uri "$apiBaseUrl/healthz" -ProcessToCheck $apiProcess
    if ($health.status -ne "ok") {
        throw "Health check failed"
    }

    $status = Invoke-RestMethod -Uri "$apiBaseUrl/v1/llm/status" -TimeoutSec 10
    if ($status.available -ne $true) {
        throw "LLM runtime was not available: $($status.reason)"
    }
    if ($status.catalog.policy.llm_safe_auto_apply -ne $false) {
        throw "LLM policy unexpectedly allows safe auto-apply"
    }
    if ($status.catalog.policy.bundled_weights -ne $false) {
        throw "LLM policy unexpectedly reports bundled weights"
    }

    $request = @{ text = $SampleText } | ConvertTo-Json -Compress
    $suggestion = Invoke-RestMethod `
        -Uri "$apiBaseUrl/v1/llm/suggest" `
        -Method Post `
        -ContentType "application/json; charset=utf-8" `
        -Body $request `
        -TimeoutSec 60

    if ($suggestion.source -ne "llm:local") {
        throw "Unexpected suggestion source: $($suggestion.source)"
    }
    if ([string]::IsNullOrWhiteSpace($suggestion.replacement)) {
        throw "LLM suggestion replacement was empty"
    }
    if ($suggestion.safe_auto_apply -ne $false) {
        throw "LLM suggestion unexpectedly safe-auto-applies"
    }

    $mode = if ($MockRuntime) { "mock runtime" } else { "configured runtime" }
    Write-Output "LLM smoke passed ($mode)"
}
finally {
    if ($null -ne $apiProcess -and -not $apiProcess.HasExited) {
        Stop-Process -Id $apiProcess.Id -Force
    }
    if ($null -ne $mockProcess -and -not $mockProcess.HasExited) {
        Stop-Process -Id $mockProcess.Id -Force
    }

    Set-ProcessEnv -Name "ALFARAHEEDI_LLM_BASE_URL" -Value $originalBaseUrl
    Set-ProcessEnv -Name "ALFARAHEEDI_LLM_MODEL" -Value $originalModel
    Set-ProcessEnv -Name "ALFARAHEEDI_LLM_TIMEOUT_MS" -Value $originalTimeout
    Set-ProcessEnv -Name "WRITECHECK_ADDR" -Value $originalApiAddr
}
