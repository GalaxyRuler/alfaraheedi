param(
    [string]$RepoRoot,
    [string]$PfxPath = "dist\office-addins-dev-cert\localhost-office-addin-dev.pfx",
    [int]$Port = 3443,
    [string]$HostName = "localhost",
    [SecureString]$PfxPassword
)

$ErrorActionPreference = "Stop"

function Resolve-RepoPath {
    param(
        [Parameter(Mandatory = $true)] [string]$BasePath,
        [Parameter(Mandatory = $true)] [string]$Path
    )
    if ([IO.Path]::IsPathRooted($Path)) {
        return $Path
    }
    return Join-Path $BasePath $Path
}

function Convert-SecureStringForChildProcess {
    param([SecureString]$Value)

    if (-not $Value) {
        return $null
    }

    $bstr = [IntPtr]::Zero
    try {
        $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
        return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
        if ($bstr -ne [IntPtr]::Zero) {
            [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }
    }
}

if (-not $RepoRoot) {
    $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $RepoRoot = (Resolve-Path $RepoRoot).Path
}

$resolvedPfxPath = Resolve-RepoPath $RepoRoot $PfxPath
$serverScript = Join-Path $RepoRoot "office-addins\tools\serve-office-addin.mjs"

if (-not (Test-Path -LiteralPath $resolvedPfxPath)) {
    throw "Office add-in dev certificate PFX not found: $resolvedPfxPath. Run .\scripts\New-OfficeAddinDevCertificate.ps1 first."
}
if (-not (Test-Path -LiteralPath $serverScript)) {
    throw "Office add-in HTTPS host script not found: $serverScript"
}

$previousPassword = $env:NAHOU_OFFICE_ADDIN_PFX_PASSWORD
$plainPassword = Convert-SecureStringForChildProcess $PfxPassword

try {
    if ($null -ne $plainPassword) {
        $env:NAHOU_OFFICE_ADDIN_PFX_PASSWORD = $plainPassword
    } else {
        Remove-Item Env:NAHOU_OFFICE_ADDIN_PFX_PASSWORD -ErrorAction SilentlyContinue
    }

    node $serverScript $RepoRoot $resolvedPfxPath $Port $HostName
    if ($LASTEXITCODE -ne 0) {
        throw "Office add-in HTTPS host exited with code $LASTEXITCODE."
    }
} finally {
    if ($null -ne $previousPassword) {
        $env:NAHOU_OFFICE_ADDIN_PFX_PASSWORD = $previousPassword
    } else {
        Remove-Item Env:NAHOU_OFFICE_ADDIN_PFX_PASSWORD -ErrorAction SilentlyContinue
    }

    $plainPassword = $null
}
