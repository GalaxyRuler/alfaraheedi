param(
    [int]$HostPort = 3000
)

$ErrorActionPreference = "Stop"
$containerName = "alfaraheedi-smoke"
$containerCreated = $false

function Invoke-Docker {
    param(
        [Parameter(Mandatory = $true)]
        [string[]] $Arguments
    )

    & docker @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "docker $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
    }
}

function ConvertFrom-Utf8JsonResponse {
    param(
        [Parameter(Mandatory = $true)]
        $Response
    )

    if ($null -eq $Response.RawContentStream) {
        return $Response.Content | ConvertFrom-Json
    }

    if ($Response.RawContentStream.CanSeek) {
        $Response.RawContentStream.Position = 0
    }

    $reader = [System.IO.StreamReader]::new(
        $Response.RawContentStream,
        [System.Text.Encoding]::UTF8,
        $true
    )
    try {
        $json = $reader.ReadToEnd()
    }
    finally {
        $reader.Dispose()
    }

    $json | ConvertFrom-Json
}

try {
    $existingContainer = docker ps -a --filter "name=^/$containerName$" --format "{{.ID}}"
    if ($LASTEXITCODE -ne 0) {
        throw "docker ps failed with exit code $LASTEXITCODE"
    }
    if (-not [string]::IsNullOrWhiteSpace($existingContainer)) {
        throw "Docker container '$containerName' already exists; remove or rename it before running this smoke."
    }

    Invoke-Docker -Arguments @("build", "-t", "alfaraheedi:local", ".")

    $container = docker run -d -p "${HostPort}:3000" --name $containerName alfaraheedi:local
    if ($LASTEXITCODE -ne 0) {
        throw "docker run failed with exit code $LASTEXITCODE"
    }
    $containerCreated = $true

    $health = $null
    for ($attempt = 1; $attempt -le 20; $attempt++) {
        try {
            $health = Invoke-RestMethod -Uri "http://127.0.0.1:$HostPort/healthz"
            break
        }
        catch {
            if ($attempt -eq 20) {
                throw
            }

            Start-Sleep -Milliseconds 500
        }
    }

    if ($health.status -ne "ok") {
        throw "Docker health check failed"
    }

    $sampleText = -join @(
        [char]0x0645, [char]0x0631, [char]0x062D, [char]0x0628,
        [char]0x0640, [char]0x0640, [char]0x0627,
        [char]0x0020, [char]0x0020,
        [char]0x0628, [char]0x0627, [char]0x0644, [char]0x0639,
        [char]0x0627, [char]0x0644, [char]0x0645
    )
    $body = @{ text = $sampleText } | ConvertTo-Json
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    $analysisResponse = Invoke-WebRequest `
        -Uri "http://127.0.0.1:$HostPort/v1/analyze" `
        -Method Post `
        -ContentType "application/json; charset=utf-8" `
        -Body $bodyBytes `
        -UseBasicParsing
    $analysis = ConvertFrom-Utf8JsonResponse $analysisResponse

    $suggestionCount = @($analysis.suggestions).Count
    if ($suggestionCount -lt 2) {
        throw "Expected at least two suggestions"
    }

    Write-Output "Docker smoke passed"
}
finally {
    if ($containerCreated) {
        docker rm -f $containerName | Out-Null
    }
}
