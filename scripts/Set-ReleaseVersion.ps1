param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$')]
    [string]$Version,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Resolve-RepoPath {
    param([Parameter(Mandatory = $true)] [string]$Path)
    return Join-Path $repoRoot $Path
}

function ConvertTo-StoreVersion {
    param([Parameter(Mandatory = $true)] [string]$Value)

    if ($Value -notmatch '^(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?$') {
        throw "Store manifest version must be x.y.z or x.y.z-rc.n: $Value"
    }

    if ($Matches[4]) {
        return "$($Matches[1]).$($Matches[2]).$($Matches[3]).$($Matches[4])"
    }

    return "$($Matches[1]).$($Matches[2]).$($Matches[3])"
}

function Add-Change {
    param(
        [System.Collections.Generic.List[object]]$Changes,
        [Parameter(Mandatory = $true)] [string]$Path,
        [Parameter(Mandatory = $true)] [string]$Description,
        [Parameter(Mandatory = $true)] [string]$Before,
        [Parameter(Mandatory = $true)] [string]$After
    )

    $Changes.Add([pscustomobject]@{
        Path = $Path
        Description = $Description
        Before = $Before
        After = $After
        Changed = $Before -ne $After
    }) | Out-Null
}

function Update-TextFile {
    param(
        [System.Collections.Generic.List[object]]$Changes,
        [Parameter(Mandatory = $true)] [string]$RelativePath,
        [Parameter(Mandatory = $true)] [string]$Description,
        [Parameter(Mandatory = $true)] [scriptblock]$Transform
    )

    $path = Resolve-RepoPath $RelativePath
    $before = Get-Content -LiteralPath $path -Raw
    $after = & $Transform $before
    Add-Change -Changes $Changes -Path $RelativePath -Description $Description -Before $before -After $after

    if (-not $DryRun -and $before -ne $after) {
        Set-Content -LiteralPath $path -Value $after -Encoding UTF8 -NoNewline
    }
}

$storeVersion = ConvertTo-StoreVersion $Version
$changes = [System.Collections.Generic.List[object]]::new()

Update-TextFile -Changes $changes -RelativePath "Cargo.toml" -Description "Workspace package version" -Transform {
    param([string]$Content)
    $Content -replace '(?m)^(version\s*=\s*)"[^"]+"', "`${1}`"$Version`""
}

Update-TextFile -Changes $changes -RelativePath "frontend/package.json" -Description "Frontend package version" -Transform {
    param([string]$Content)
    $json = $Content | ConvertFrom-Json
    $json.version = $Version
    ($json | ConvertTo-Json -Depth 20) + "`n"
}

Update-TextFile -Changes $changes -RelativePath "src-tauri/tauri.conf.json" -Description "Tauri bundle version" -Transform {
    param([string]$Content)
    $json = $Content | ConvertFrom-Json
    $json.version = $Version
    ($json | ConvertTo-Json -Depth 20) + "`n"
}

Update-TextFile -Changes $changes -RelativePath "browser-extension/manifest.json" -Description "Chrome-compatible extension version" -Transform {
    param([string]$Content)
    $json = $Content | ConvertFrom-Json
    $json.version = $storeVersion
    ($json | ConvertTo-Json -Depth 20) + "`n"
}

Update-TextFile -Changes $changes -RelativePath "office-addins/manifest.xml" -Description "Office-compatible add-in version" -Transform {
    param([string]$Content)
    $xml = [xml]$Content
    $xml.OfficeApp.Version = $storeVersion
    $stringWriter = [System.IO.StringWriter]::new()
    $settings = [System.Xml.XmlWriterSettings]::new()
    $settings.Indent = $true
    $settings.OmitXmlDeclaration = $false
    $writer = [System.Xml.XmlWriter]::Create($stringWriter, $settings)
    $xml.Save($writer)
    $writer.Close()
    $stringWriter.ToString()
}

$artifactReplacements = @{
    "scripts/package-windows.ps1" = @{
        Pattern = '\[string\]\$Version = "[^"]+"'
        Replacement = "[string]`$Version = `"$Version`""
        Description = "Default optional Windows developer zip version"
    }
    "scripts/capture-browser-extension-store-screenshots.ps1" = @{
        Pattern = 'nahou-browser-extension-\d+\.\d+\.\d+(?:\.\d+)?\.zip'
        Replacement = "nahou-browser-extension-$storeVersion.zip"
        Description = "Browser extension screenshot package path"
    }
    "scripts/qa-browser-extension-ax-smoke.ps1" = @{
        Pattern = 'nahou-browser-extension-\d+\.\d+\.\d+(?:\.\d+)?\.zip'
        Replacement = "nahou-browser-extension-$storeVersion.zip"
        Description = "Browser extension accessibility smoke package path"
    }
    "scripts/qa-browser-extension-keyboard-flow-smoke.ps1" = @{
        Pattern = 'nahou-browser-extension-\d+\.\d+\.\d+(?:\.\d+)?\.zip'
        Replacement = "nahou-browser-extension-$storeVersion.zip"
        Description = "Browser extension keyboard smoke package path"
    }
    "scripts/qa-browser-extension-production-editors-smoke.ps1" = @{
        Pattern = 'nahou-browser-extension-\d+\.\d+\.\d+(?:\.\d+)?\.zip'
        Replacement = "nahou-browser-extension-$storeVersion.zip"
        Description = "Browser extension production editor smoke package path"
    }
}

foreach ($entry in $artifactReplacements.GetEnumerator()) {
    $relativePath = $entry.Key
    $rule = $entry.Value
    Update-TextFile -Changes $changes -RelativePath $relativePath -Description $rule.Description -Transform {
        param([string]$Content)
        $Content -replace $rule.Pattern, $rule.Replacement
    }
}

$planned = [pscustomobject]@{
    Version = $Version
    StoreManifestVersion = $storeVersion
    DryRun = [bool]$DryRun
    Files = @($changes | Where-Object { $_.Changed } | ForEach-Object { $_.Path })
}

if ($DryRun) {
    $planned | ConvertTo-Json -Depth 4
    return
}

$planned | ConvertTo-Json -Depth 4
