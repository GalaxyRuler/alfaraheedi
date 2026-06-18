$ErrorActionPreference = "Stop"

$port = 3197
$env:WRITECHECK_ADDR = "127.0.0.1:$port"
$server = $null
$expectedText = "مرحبا بالعالم"

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

    $body = @{ text = "مرحبــا  بالعالم"; mode = "safe" } | ConvertTo-Json
    $apply = Invoke-RestMethod `
        -Uri "http://127.0.0.1:${port}/v1/apply" `
        -Method Post `
        -ContentType "application/json" `
        -Body $body

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
