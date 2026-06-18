$ErrorActionPreference = "Stop"

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

try {
    Invoke-Docker -Arguments @("build", "-t", "alfaraheedi:local", ".")

    $container = docker run -d -p 3000:3000 --name alfaraheedi-smoke alfaraheedi:local
    if ($LASTEXITCODE -ne 0) {
        throw "docker run failed with exit code $LASTEXITCODE"
    }

    $health = $null
    for ($attempt = 1; $attempt -le 20; $attempt++) {
        try {
            $health = Invoke-RestMethod -Uri "http://127.0.0.1:3000/healthz"
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

    $body = @{ text = "مرحبــا  بالعالم" } | ConvertTo-Json
    $analysis = Invoke-RestMethod `
        -Uri "http://127.0.0.1:3000/v1/analyze" `
        -Method Post `
        -ContentType "application/json" `
        -Body $body

    $suggestionCount = @($analysis.suggestions).Count
    if ($suggestionCount -lt 2) {
        throw "Expected at least two suggestions"
    }

    Write-Output "Docker smoke passed"
}
finally {
    docker rm -f alfaraheedi-smoke | Out-Null
}
