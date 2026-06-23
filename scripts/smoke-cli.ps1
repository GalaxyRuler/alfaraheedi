$ErrorActionPreference = "Stop"

$sample = Join-Path $env:TEMP "alfaraheedi-cli-smoke.txt"
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
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

try {
    [System.IO.File]::WriteAllText($sample, $sampleText, $utf8NoBom)

    $json = cargo run -p write-cli -- check --format json $sample
    $jsonText = $json -join [Environment]::NewLine
    $null = $jsonText | ConvertFrom-Json

    $fixed = cargo run -p write-cli -- fix --safe $sample
    if ($fixed.Trim() -ne $expectedText) {
        throw "Unexpected fixed text: $fixed"
    }

    Write-Output "CLI smoke passed"
}
finally {
    Remove-Item -LiteralPath $sample -ErrorAction SilentlyContinue
}
