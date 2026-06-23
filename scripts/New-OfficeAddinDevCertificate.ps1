param(
    [string]$OutDir = "dist\office-addins-dev-cert",
    [string]$DnsName = "localhost",
    [SecureString]$PfxPassword,
    [switch]$Trust
)

$ErrorActionPreference = "Stop"

function Resolve-RepoPath {
    param([Parameter(Mandatory = $true)] [string]$Path)
    if ([IO.Path]::IsPathRooted($Path)) {
        return $Path
    }
    return Join-Path $script:RepoRoot $Path
}

function Assert-Windows {
    $isWindows = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform(
        [System.Runtime.InteropServices.OSPlatform]::Windows
    )
    if (-not $isWindows) {
        throw "Office add-in dev certificates use the Windows certificate provider and must be created on Windows."
    }
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Assert-Windows

if (-not $PfxPassword) {
    $PfxPassword = ConvertTo-SecureString "" -AsPlainText -Force
}

$resolvedOutDir = Resolve-RepoPath $OutDir
New-Item -ItemType Directory -Force -Path $resolvedOutDir | Out-Null

$pfxPath = Join-Path $resolvedOutDir "localhost-office-addin-dev.pfx"
$publicCertPath = Join-Path $resolvedOutDir "localhost-office-addin-dev.cer"
$friendlyName = "Nahou Office Add-in Localhost Dev"

$cert = New-SelfSignedCertificate `
    -DnsName $DnsName `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -FriendlyName $friendlyName `
    -KeyExportPolicy Exportable `
    -KeyLength 2048 `
    -KeyUsage DigitalSignature, KeyEncipherment `
    -NotAfter (Get-Date).AddYears(1) `
    -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.1")

Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $PfxPassword | Out-Null
Export-Certificate -Cert $cert -FilePath $publicCertPath | Out-Null

if ($Trust) {
    Import-Certificate -FilePath $publicCertPath -CertStoreLocation "Cert:\CurrentUser\Root" | Out-Null
}

[pscustomobject]@{
    DnsName = $DnsName
    FriendlyName = $friendlyName
    CertificateThumbprint = $cert.Thumbprint
    PfxPath = $pfxPath
    PublicCertificatePath = $publicCertPath
    TrustedInCurrentUserRoot = [bool]$Trust
    TrustChanged = [bool]$Trust
} | ConvertTo-Json -Depth 4
