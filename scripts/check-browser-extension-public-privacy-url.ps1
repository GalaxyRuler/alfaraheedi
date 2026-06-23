param(
    [string]$PrivacyUrl = "https://galaxyruler.github.io/alfaraheedi/browser-extension/privacy.html",

    [switch]$RequireLive
)

$ErrorActionPreference = "Stop"

$requiredText = @(
    "Nahou Browser Extension Privacy Policy",
    "Last updated: 2026-06-22",
    "local loopback Nahou API",
    "does not send text to Nahou-hosted services",
    "does not store captured editor text",
    "does not use telemetry",
    "does not load or execute remote code",
    "No Nahou operator or reviewer receives or reads user editor text"
)

$statusCode = $null
$reachable = $false
$contentMatches = $false
$missingText = @()
$errorMessage = $null

try {
    $response = Invoke-WebRequest -Uri $PrivacyUrl -UseBasicParsing -TimeoutSec 20
    $statusCode = [int]$response.StatusCode
    $reachable = ($statusCode -ge 200 -and $statusCode -lt 300)
    $body = [string]$response.Content

    foreach ($text in $requiredText) {
        if (-not $body.Contains($text)) {
            $missingText += $text
        }
    }

    $contentMatches = ($missingText.Count -eq 0)
} catch {
    $errorMessage = $_.Exception.Message
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
        $statusCode = [int]$_.Exception.Response.StatusCode
    }
}

$ok = ($reachable -and $contentMatches)
$result = [pscustomobject]@{
    Url = $PrivacyUrl
    Reachable = $reachable
    StatusCode = $statusCode
    ContentMatches = $contentMatches
    MissingText = $missingText
    Error = $errorMessage
    ReadyForStorePrivacyUrl = $ok
}

$result | ConvertTo-Json -Depth 4

if ($RequireLive -and -not $ok) {
    throw "Browser extension public privacy URL is not live or does not match required policy text: $PrivacyUrl"
}
