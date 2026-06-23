param(
    [string]$Repository = "GalaxyRuler/alfaraheedi",

    [string]$Branch = "main",

    [string]$PrivacyUrl = "https://galaxyruler.github.io/alfaraheedi/browser-extension/privacy.html",

    [switch]$RequireReady
)

$ErrorActionPreference = "Stop"

function Convert-GhError {
    param([AllowEmptyString()] [string]$RawError)

    $jsonMatch = [regex]::Match($RawError, '\{[\s\S]*"message"[\s\S]*?\}')
    if ($jsonMatch.Success) {
        try {
            $jsonError = $jsonMatch.Value | ConvertFrom-Json
            if ($jsonError.message -and $jsonError.status) {
                return "$($jsonError.message) (HTTP $($jsonError.status))"
            }
            if ($jsonError.message) {
                return $jsonError.message
            }
        } catch {
            # Fall back to line-based extraction below.
        }
    }

    $ghMatch = [regex]::Match($RawError, 'gh(?:\.exe)?\s*:\s*gh:\s*(?<message>[^\r\n]+)')
    if ($ghMatch.Success) {
        return $ghMatch.Groups["message"].Value.Trim()
    }

    $firstLine = @($RawError -split "\r?\n" | Where-Object { $_.Trim() } | Select-Object -First 1)
    if ($firstLine.Count -gt 0) {
        return $firstLine[0].Trim()
    }

    return "gh command failed"
}

function Invoke-GhJson {
    param([Parameter(Mandatory = $true)] [string[]]$Arguments)

    $previousActionPreference = $ErrorActionPreference
    $nativePreferenceVariable = Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue
    $hadNativePreference = $null -ne $nativePreferenceVariable
    $previousNativePreference = if ($hadNativePreference) {
        $PSNativeCommandUseErrorActionPreference
    } else {
        $null
    }

    $ErrorActionPreference = "Continue"
    if ($hadNativePreference) {
        $PSNativeCommandUseErrorActionPreference = $false
    }

    $errorPath = [IO.Path]::GetTempFileName()
    try {
        $output = & gh @Arguments 2> $errorPath
        $exitCode = $LASTEXITCODE
    } catch {
        $output = @($_.Exception.Message)
        $exitCode = if ($LASTEXITCODE) { $LASTEXITCODE } else { 1 }
    } finally {
        $errorOutput = if (Test-Path -LiteralPath $errorPath) {
            $rawErrorOutput = Get-Content -LiteralPath $errorPath -Raw
            if ($null -eq $rawErrorOutput) {
                ""
            } else {
                $rawErrorOutput.Trim()
            }
        } else {
            ""
        }
        if (Test-Path -LiteralPath $errorPath) {
            Remove-Item -LiteralPath $errorPath -Force
        }
        if ($hadNativePreference) {
            $PSNativeCommandUseErrorActionPreference = $previousNativePreference
        }
        $ErrorActionPreference = $previousActionPreference
    }

    if ($exitCode -ne 0) {
        $rawError = (@($errorOutput, ($output | Out-String).Trim()) |
            Where-Object { $_ }) -join "`n"
        return [pscustomobject]@{
            Ok = $false
            Json = $null
            ExitCode = $exitCode
            Error = Convert-GhError $rawError
        }
    }

    return [pscustomobject]@{
        Ok = $true
        Json = ($output | Out-String | ConvertFrom-Json)
        ExitCode = 0
        Error = $null
    }
}

$pagesResponse = Invoke-GhJson @("api", "repos/$Repository/pages")
$workflowResponse = Invoke-GhJson @(
    "api",
    "repos/$Repository/contents/.github/workflows/pages.yml?ref=$Branch"
)
$privacyResponseJson = & (Join-Path $PSScriptRoot "check-browser-extension-public-privacy-url.ps1") -PrivacyUrl $PrivacyUrl
$privacyResponse = $privacyResponseJson | ConvertFrom-Json

$pagesConfigured = $pagesResponse.Ok
$pagesBuildType = if ($pagesConfigured) { $pagesResponse.Json.build_type } else { $null }
$pagesSourceBranch = if ($pagesConfigured -and $pagesResponse.Json.source) {
    $pagesResponse.Json.source.branch
} else {
    $null
}
$pagesUrl = if ($pagesConfigured) { $pagesResponse.Json.html_url } else { $null }
$workflowOnBranch = $workflowResponse.Ok
$workflowSha = if ($workflowOnBranch) { $workflowResponse.Json.sha } else { $null }

$ready = (
    $pagesConfigured -and
    $workflowOnBranch -and
    $privacyResponse.ReadyForStorePrivacyUrl
)

$result = [pscustomobject]@{
    Repository = $Repository
    Branch = $Branch
    PagesConfigured = $pagesConfigured
    PagesBuildType = $pagesBuildType
    PagesSourceBranch = $pagesSourceBranch
    PagesUrl = $pagesUrl
    PagesError = $pagesResponse.Error
    WorkflowOnBranch = $workflowOnBranch
    WorkflowSha = $workflowSha
    WorkflowError = $workflowResponse.Error
    PrivacyUrl = $PrivacyUrl
    PrivacyUrlReachable = $privacyResponse.Reachable
    PrivacyUrlStatusCode = $privacyResponse.StatusCode
    PrivacyUrlContentMatches = $privacyResponse.ContentMatches
    ReadyForStorePrivacyUrl = $privacyResponse.ReadyForStorePrivacyUrl
    ReadyForStoreSubmission = $ready
}

$result | ConvertTo-Json -Depth 5

if ($RequireReady -and -not $ready) {
    throw "Browser extension Pages/privacy URL path is not ready for store submission."
}
