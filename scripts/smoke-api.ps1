$ErrorActionPreference = "Stop"

$port = 3197
$env:WRITECHECK_ADDR = "127.0.0.1:$port"
$server = $null
$sampleText = -join @(
    [char]0x0645, [char]0x0631, [char]0x062D, [char]0x0628,
    [char]0x0640, [char]0x0640, [char]0x0627,
    [char]0x0020, [char]0x0020,
    [char]0x0628, [char]0x0627, [char]0x0644, [char]0x0639,
    [char]0x0627, [char]0x0644, [char]0x0645
)
$expectedText = -join @(
    [char]0x0645, [char]0x0631, [char]0x062D, [char]0x0628,
    [char]0x0627, [char]0x0020,
    [char]0x0628, [char]0x0627, [char]0x0644, [char]0x0639,
    [char]0x0627, [char]0x0644, [char]0x0645
)

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
    cargo build -p write-api

    $server = Start-Process `
        -FilePath ".\target\debug\write-api.exe" `
        -WorkingDirectory (Get-Location) `
        -PassThru `
        -WindowStyle Hidden

    $health = $null
    for ($attempt = 1; $attempt -le 10; $attempt++) {
        if ($server.HasExited) {
            throw "write-api exited early with code $($server.ExitCode)"
        }

        try {
            $health = Invoke-RestMethod -Uri "http://127.0.0.1:${port}/healthz"
            break
        }
        catch {
            if ($attempt -eq 10) {
                throw
            }

            Start-Sleep -Milliseconds 500
        }
    }

    if ($health.status -ne "ok") {
        throw "Health check failed"
    }

    $body = @{ text = $sampleText; mode = "safe" } | ConvertTo-Json
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    $applyResponse = Invoke-WebRequest `
        -Uri "http://127.0.0.1:${port}/v1/apply" `
        -Method Post `
        -ContentType "application/json; charset=utf-8" `
        -Body $bodyBytes `
        -UseBasicParsing
    $apply = ConvertFrom-Utf8JsonResponse $applyResponse

    if ($apply.text -ne $expectedText) {
        throw "Unexpected API fixed text: $($apply.text)"
    }

    Write-Output "API smoke passed"
}
finally {
    if ($null -ne $server -and -not $server.HasExited) {
        Stop-Process -Id $server.Id -Force
    }

    Remove-Item Env:\WRITECHECK_ADDR -ErrorAction SilentlyContinue
}
