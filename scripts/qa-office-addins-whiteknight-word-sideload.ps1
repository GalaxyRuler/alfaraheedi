param(
    [ValidateSet("Word", "PowerPoint")]
    [string]$HostApp = "Word",
    [string]$Remote = "codex-whiteknight",
    [string]$RunAsUser = "WHITEKNIGHT\aoa",
    [string]$RemoteArtifactRoot = "C:\AgentArtifacts\nahou-office-whiteknight",
    [string]$LocalArtifactRoot = "dist\office-addins-whiteknight-qa",
    [string]$HomelabRoot = "C:\CodexProjects\new-project-3",
    [string]$WriteCliPath = "target\release\writecheck.exe",
    [int]$TimeoutSeconds = 420,
    [switch]$SkipCargoBuild,
    [switch]$SkipReadinessGates,
    [switch]$SkipDesktopPrepare,
    [switch]$StageOnly,
    [switch]$AllowBlocked
)

$ErrorActionPreference = "Stop"

function Resolve-RepoPath {
    param([Parameter(Mandatory = $true)] [string]$Path)
    if ([IO.Path]::IsPathRooted($Path)) {
        return $Path
    }
    return Join-Path $script:RepoRoot $Path
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)] [string]$FilePath,
        [Parameter(Mandatory = $true)] [string[]]$ArgumentList,
        [string]$WorkingDirectory = $script:RepoRoot
    )

    Push-Location $WorkingDirectory
    try {
        & $FilePath @ArgumentList
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($ArgumentList -join ' ')"
        }
    } finally {
        Pop-Location
    }
}

function Invoke-CapturedNative {
    param(
        [Parameter(Mandatory = $true)] [string]$FilePath,
        [Parameter(Mandatory = $true)] [string[]]$ArgumentList,
        [Parameter(Mandatory = $true)] [string]$LogPath,
        [string]$WorkingDirectory = $script:RepoRoot
    )

    Push-Location $WorkingDirectory
    try {
        $output = & $FilePath @ArgumentList 2>&1
        $exitCode = $LASTEXITCODE
        $output | Set-Content -LiteralPath $LogPath -Encoding utf8
        if ($exitCode -ne 0) {
            throw "Command failed with exit code ${exitCode}: $FilePath $($ArgumentList -join ' '). See $LogPath"
        }
        return $output
    } finally {
        Pop-Location
    }
}

function Get-Sha256Hex {
    param([Parameter(Mandatory = $true)] [string]$Path)
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash
}

function ConvertTo-PowerShellSingleQuoted {
    param([Parameter(Mandatory = $true)] [string]$Value)
    return "'" + ($Value -replace "'", "''") + "'"
}

function ConvertTo-WindowsScpPath {
    param([Parameter(Mandatory = $true)] [string]$WindowsPath)

    if ($WindowsPath -notmatch "^[A-Za-z]:\\") {
        throw "Expected an absolute Windows path, got: $WindowsPath"
    }

    $driveName = $WindowsPath.Substring(0, 1)
    $pathPart = $WindowsPath.Substring(3).Replace("\", "/")
    return "/${driveName}:/$pathPart"
}

function Copy-DirectoryClean {
    param(
        [Parameter(Mandatory = $true)] [string]$Source,
        [Parameter(Mandatory = $true)] [string]$Destination
    )

    if (Test-Path -LiteralPath $Destination) {
        Remove-Item -LiteralPath $Destination -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
    Copy-Item -LiteralPath $Source -Destination $Destination -Recurse -Force
}

function New-WordFixtureDocument {
    param(
        [Parameter(Mandatory = $true)] [string]$Path,
        [Parameter(Mandatory = $true)] [string]$Text
    )

    $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("nahou-docx-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
    try {
        $relsDir = Join-Path $tempRoot "_rels"
        $wordDir = Join-Path $tempRoot "word"
        $wordRelsDir = Join-Path $wordDir "_rels"
        New-Item -ItemType Directory -Force -Path $relsDir, $wordDir, $wordRelsDir | Out-Null

        $escapedText = [System.Security.SecurityElement]::Escape($Text)
        $contentTypes = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
</Types>
'@
        $rootRels = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
'@
        $documentRels = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>
'@
        $settings = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:compat>
    <w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>
  </w:compat>
</w:settings>
'@
        $document = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t xml:space="preserve">$escapedText</w:t>
      </w:r>
    </w:p>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>
"@

        Set-Content -LiteralPath (Join-Path $tempRoot "[Content_Types].xml") -Value $contentTypes -Encoding utf8
        Set-Content -LiteralPath (Join-Path $relsDir ".rels") -Value $rootRels -Encoding utf8
        Set-Content -LiteralPath (Join-Path $wordRelsDir "document.xml.rels") -Value $documentRels -Encoding utf8
        Set-Content -LiteralPath (Join-Path $wordDir "settings.xml") -Value $settings -Encoding utf8
        Set-Content -LiteralPath (Join-Path $wordDir "document.xml") -Value $document -Encoding utf8

        $zipPath = "$Path.zip"
        if (Test-Path -LiteralPath $zipPath) {
            Remove-Item -LiteralPath $zipPath -Force
        }
        if (Test-Path -LiteralPath $Path) {
            Remove-Item -LiteralPath $Path -Force
        }
        Compress-Archive -Path (Join-Path $tempRoot "*") -DestinationPath $zipPath -Force
        Move-Item -LiteralPath $zipPath -Destination $Path -Force
    } finally {
        if (Test-Path -LiteralPath $tempRoot) {
            Remove-Item -LiteralPath $tempRoot -Recurse -Force
        }
    }
}

function New-RemoteOfficeRunnerScript {
    return @'
param(
    [string]$RunRoot = (Split-Path -Parent $MyInvocation.MyCommand.Path),
    [ValidateSet("Word", "PowerPoint")]
    [string]$HostApp = "Word"
)

$ErrorActionPreference = "Stop"

function ConvertFrom-FixtureBase64 {
    param([Parameter(Mandatory = $true)] [string]$Value)
    return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Value))
}

function Get-Sha256Text {
    param([Parameter(Mandatory = $true)] [string]$Value)
    $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($sha.ComputeHash($bytes)) -replace "-", "")
    } finally {
        $sha.Dispose()
    }
}

function Set-QaEnvironmentPath {
    $windowsRoot = if ($env:WINDIR) { $env:WINDIR } else { "C:\Windows" }
    $env:ComSpec = Join-Path $windowsRoot "System32\cmd.exe"
    $pathEntries = @(
        (Join-Path $windowsRoot "System32"),
        $windowsRoot,
        (Join-Path $windowsRoot "System32\WindowsPowerShell\v1.0"),
        "C:\Program Files\nodejs",
        $env:Path
    )
    $env:Path = ($pathEntries | Where-Object { $_ }) -join ";"
}

function Add-Check {
    param(
        [Parameter(Mandatory = $true)] [string]$Name,
        [Parameter(Mandatory = $true)] [bool]$Passed,
        [string]$Details = ""
    )
    $script:Checks[$Name] = $Passed
    if ($Details) {
        $script:Events.Add([pscustomobject]@{
            time = (Get-Date).ToString("o")
            name = $Name
            passed = $Passed
            details = $Details
        }) | Out-Null
    }
}

function Write-Result {
    param([bool]$Ok)
    $officeRuntimeLog = Join-Path $env:TEMP "OfficeAddins.log.txt"
    if (Test-Path -LiteralPath $officeRuntimeLog) {
        Copy-Item -LiteralPath $officeRuntimeLog -Destination (Join-Path $script:RunRoot "OfficeAddins.log.txt") -Force
    }
    $script:Result.Ok = $Ok
    $script:Result.CompletedAt = (Get-Date).ToString("o")
    $script:Result.Checks = $script:Checks
    $script:Result.Events = $script:Events
    $script:Result | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $script:ResultPath -Encoding utf8
}

function Start-OwnedProcess {
    param(
        [Parameter(Mandatory = $true)] [string]$FilePath,
        [Parameter(Mandatory = $true)] [string[]]$ArgumentList,
        [Parameter(Mandatory = $true)] [string]$WorkingDirectory,
        [Parameter(Mandatory = $true)] [string]$LogStem
    )

    $stdout = Join-Path $script:RunRoot "$LogStem.stdout.log"
    $stderr = Join-Path $script:RunRoot "$LogStem.stderr.log"
    $process = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -WorkingDirectory $WorkingDirectory -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru -WindowStyle Hidden
    $script:OwnedProcessIds.Add($process.Id) | Out-Null
    return $process
}

function Wait-HttpText {
    param(
        [Parameter(Mandatory = $true)] [string]$Url,
        [Parameter(Mandatory = $true)] [string]$Contains,
        [switch]$SkipCertificateCheck
    )

    $deadline = (Get-Date).AddSeconds(45)
    while ((Get-Date) -lt $deadline) {
        try {
            if ($SkipCertificateCheck) {
                $content = & (Join-Path $env:WINDIR "System32\curl.exe") -k -s $Url
                if ($LASTEXITCODE -eq 0 -and $content -like "*$Contains*") {
                    return $true
                }
            } else {
                $content = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
                if ([string]$content.Content -like "*$Contains*") {
                    return $true
                }
            }
        } catch {}
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Save-Screenshot {
    param([Parameter(Mandatory = $true)] [string]$Path)
    try {
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        $bitmap = [System.Drawing.Bitmap]::new($bounds.Width, $bounds.Height)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
            $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
        } finally {
            $graphics.Dispose()
            $bitmap.Dispose()
        }
    } catch {
        $script:Events.Add([pscustomobject]@{
            time = (Get-Date).ToString("o")
            name = "ScreenshotFailed"
            passed = $false
            details = $_.Exception.Message
        }) | Out-Null
    }
}

function Add-UiAutomationTypes {
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
}

function Get-UiaRoot {
    return [System.Windows.Automation.AutomationElement]::RootElement
}

function Find-UiaByAutomationId {
    param(
        [Parameter(Mandatory = $true)] [string]$AutomationId,
        [int]$TimeoutSeconds = 15
    )

    $condition = [System.Windows.Automation.PropertyCondition]::new(
        [System.Windows.Automation.AutomationElement]::AutomationIdProperty,
        $AutomationId
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $element = (Get-UiaRoot).FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
        } catch {
            Start-Sleep -Milliseconds 500
            continue
        }
        if ($element) {
            return $element
        }
        Start-Sleep -Milliseconds 500
    }
    return $null
}

function Find-UiaByNameLike {
    param(
        [Parameter(Mandatory = $true)] [string]$Needle,
        [int]$TimeoutSeconds = 15,
        [string]$ControlTypeName = ""
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $all = (Get-UiaRoot).FindAll(
                [System.Windows.Automation.TreeScope]::Descendants,
                [System.Windows.Automation.Condition]::TrueCondition
            )
        } catch {
            Start-Sleep -Milliseconds 500
            continue
        }
        foreach ($element in $all) {
            try {
                $name = [string]$element.Current.Name
                $controlType = [string]$element.Current.ControlType.ProgrammaticName
            } catch {
                continue
            }
            if ($name -like "*$Needle*" -and (-not $ControlTypeName -or $controlType -like "*$ControlTypeName*")) {
                return $element
            }
        }
        Start-Sleep -Milliseconds 500
    }
    return $null
}

function Get-OfficeAddinsDisabledMessage {
    param([int]$TimeoutSeconds = 3)

    $element = Find-UiaByNameLike "Add-ins are disabled" -TimeoutSeconds $TimeoutSeconds
    if (-not $element) {
        return $null
    }
    try {
        $message = [string]$element.Current.Name
        if ($message.Length -gt 220) {
            return $message.Substring(0, 220)
        }
        return $message
    } catch {
        return "Add-ins are disabled in this Office host."
    }
}

function Invoke-UiaElement {
    param([Parameter(Mandatory = $true)] $Element)
    $invokePattern = $null
    if ($Element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$invokePattern)) {
        $invokePattern.Invoke()
        return $true
    }
    try {
        $Element.SetFocus()
        Start-Sleep -Milliseconds 250
        [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
        return $true
    } catch {
        return $false
    }
}

function Save-UiaSnapshot {
    param([Parameter(Mandatory = $true)] [string]$Path)

    try {
        Add-UiAutomationTypes
        $items = New-Object System.Collections.Generic.List[object]
        $all = (Get-UiaRoot).FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition
        )
        foreach ($element in $all) {
            if ($items.Count -ge 300) {
                break
            }
            try {
                $name = [string]$element.Current.Name
                $automationId = [string]$element.Current.AutomationId
                $controlType = [string]$element.Current.ControlType.ProgrammaticName
            } catch {
                continue
            }
            if ($name -like "*$script:SampleText*" -or $name -like "*$script:ExpectedText*") {
                $name = "<public-fixture-text-redacted>"
            }
            if ($name.Length -gt 160) {
                $name = $name.Substring(0, 160)
            }
            $items.Add([pscustomobject]@{
                name = $name
                automationId = $automationId
                controlType = $controlType
            }) | Out-Null
        }
        $items | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $Path -Encoding utf8
    } catch {
        $script:Events.Add([pscustomobject]@{
            time = (Get-Date).ToString("o")
            name = "UiaSnapshotFailed"
            passed = $false
            details = $_.Exception.Message
        }) | Out-Null
    }
}

function Add-User32Types {
    if (-not ("NahouOfficeQaUser32" -as [type])) {
        Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NahouOfficeQaUser32 {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
    }
}

function Get-ActiveWordText {
    try {
        $word = [Runtime.InteropServices.Marshal]::GetActiveObject("Word.Application")
        if (-not $word -or -not $word.ActiveDocument) {
            return $null
        }
        return ([string]$word.ActiveDocument.Content.Text).Trim()
    } catch {
        $script:Events.Add([pscustomobject]@{
            time = (Get-Date).ToString("o")
            name = "WordComReadFailed"
            passed = $false
            details = $_.Exception.Message
        }) | Out-Null
        return $null
    }
}

function Initialize-PowerPointFixtureSelection {
    try {
        $powerPoint = [Runtime.InteropServices.Marshal]::GetActiveObject("PowerPoint.Application")
        if (-not $powerPoint) {
            return $false
        }

        $presentation = $null
        if ($powerPoint.Presentations.Count -gt 0) {
            $presentation = $powerPoint.ActivePresentation
        } else {
            $presentation = $powerPoint.Presentations.Add()
        }

        $slide = $null
        if ($presentation.Slides.Count -gt 0) {
            $slide = $presentation.Slides.Item(1)
        } else {
            $slide = $presentation.Slides.Add(1, 12)
        }

        while ($slide.Shapes.Count -gt 0) {
            $slide.Shapes.Item(1).Delete()
        }

        $shape = $slide.Shapes.AddTextbox(1, 96, 120, 520, 90)
        $shape.Name = "NahouPowerPointQaFixture"
        $shape.TextFrame.TextRange.Text = $script:SampleText
        $shape.TextFrame.TextRange.Font.Size = 28
        $powerPoint.ActiveWindow.View.GotoSlide(1)
        $shape.TextFrame.TextRange.Select()
        return $true
    } catch {
        $script:Events.Add([pscustomobject]@{
            time = (Get-Date).ToString("o")
            name = "PowerPointComFixtureFailed"
            passed = $false
            details = $_.Exception.Message
        }) | Out-Null
        return $false
    }
}

function Get-ActivePowerPointText {
    try {
        $powerPoint = [Runtime.InteropServices.Marshal]::GetActiveObject("PowerPoint.Application")
        if (-not $powerPoint -or -not $powerPoint.ActivePresentation) {
            return $null
        }

        $slide = $powerPoint.ActivePresentation.Slides.Item(1)
        foreach ($shape in $slide.Shapes) {
            if ([string]$shape.Name -eq "NahouPowerPointQaFixture") {
                return ([string]$shape.TextFrame.TextRange.Text).Trim()
            }
        }
        return $null
    } catch {
        $script:Events.Add([pscustomobject]@{
            time = (Get-Date).ToString("o")
            name = "PowerPointComReadFailed"
            passed = $false
            details = $_.Exception.Message
        }) | Out-Null
        return $null
    }
}

function Get-ActiveOfficeText {
    if ($script:HostApp -eq "PowerPoint") {
        return Get-ActivePowerPointText
    }
    return Get-ActiveWordText
}

$script:RunRoot = (Resolve-Path $RunRoot).Path
$script:HostApp = $HostApp
$script:HostSlug = if ($script:HostApp -eq "PowerPoint") { "powerpoint" } else { "word" }
$script:ProcessName = if ($script:HostApp -eq "PowerPoint") { "POWERPNT" } else { "WINWORD" }
$script:ResultPath = Join-Path $script:RunRoot "$($script:HostSlug)-sideload-result.json"
$script:Checks = [ordered]@{}
$script:Events = New-Object System.Collections.Generic.List[object]
$script:OwnedProcessIds = New-Object System.Collections.Generic.List[int]
$script:SampleText = ConvertFrom-FixtureBase64 "2YPZitmBINit2KfZhCAg2YXYpyDYp9iu2KjYp9ix"
$script:ExpectedText = ConvertFrom-FixtureBase64 "2YPZitmBINit2KfZhCDZhdinINin2K7YqNin2LE="

$script:Result = [ordered]@{
    Ok = $false
    Runner = "WhiteKnight"
    Scenario = "$($script:HostApp) sideload selected-text read and safe replacement"
    OfficeHost = $script:HostApp
    RunRoot = $script:RunRoot
    StartedAt = (Get-Date).ToString("o")
    CompletedAt = $null
    SampleCharCount = $script:SampleText.Length
    SampleSha256 = Get-Sha256Text $script:SampleText
    ExpectedCharCount = $script:ExpectedText.Length
    ExpectedSha256 = Get-Sha256Text $script:ExpectedText
    ReportStoresRawPrivateText = $false
    Checks = $script:Checks
    Events = $script:Events
    OfficeProcessIds = @()
    FinalTextCharCount = $null
    FinalTextSha256 = $null
    Artifacts = [ordered]@{
        screenshot = "$($script:HostSlug)-sideload.png"
        uiaSnapshot = "uia-snapshot.json"
        console = "$($script:HostSlug)-sideload-console.log"
        officeRuntimeLog = "OfficeAddins.log.txt"
        result = "$($script:HostSlug)-sideload-result.json"
    }
}

Set-QaEnvironmentPath
$repoRoot = Join-Path $script:RunRoot "repo"
$writecheck = Join-Path $script:RunRoot "writecheck.exe"
$manifestPath = Join-Path $repoRoot "office-addins\manifest.xml"
$wordFixturePath = Join-Path $script:RunRoot "word-fixture.docx"
$pfxPath = Join-Path $script:RunRoot "localhost-office-addin-dev.pfx"
$certImportPath = Join-Path $script:RunRoot "cert-import.json"
$packageJsonPath = Join-Path $repoRoot "package.json"

try {
    Add-Check "ComSpecConfigured" ($env:ComSpec -like "*System32\cmd.exe") $env:ComSpec

    $preexistingOfficeIds = @(Get-Process -Name $script:ProcessName -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
    Add-Check "NoPreexisting$($script:HostApp)" ($preexistingOfficeIds.Count -eq 0) (($preexistingOfficeIds -join ","))
    if ($preexistingOfficeIds.Count -gt 0) {
        throw "Preexisting $($script:ProcessName) processes are open on WhiteKnight. Close them before running this QA harness."
    }

    if (-not (Test-Path -LiteralPath $packageJsonPath)) {
        '{"type":"module","private":true}' | Set-Content -LiteralPath $packageJsonPath -Encoding utf8
    }
    Add-Check "PackageJsonPresent" (Test-Path -LiteralPath $packageJsonPath) $packageJsonPath

    $certImport = $null
    if (Test-Path -LiteralPath $certImportPath) {
        $certImport = Get-Content -LiteralPath $certImportPath -Raw | ConvertFrom-Json
    }
    $certImportOk = $certImport -and $certImport.ok -eq $true
    Add-Check "CertificateImportedWithCertutil" $certImportOk "dispatcher certutil exitCode=$($certImport.exitCode)"
    if (-not $certImportOk) {
        throw "certutil.exe did not import the localhost certificate before the interactive task."
    }

    $api = Start-OwnedProcess -FilePath $writecheck -ArgumentList @("serve", "--addr", "127.0.0.1:3000") -WorkingDirectory $script:RunRoot -LogStem "writecheck-api"
    $apiReady = Wait-HttpText "http://127.0.0.1:3000/v1/health" "ok"
    Add-Check "ApiReady" $apiReady "http://127.0.0.1:3000/v1/health"
    if (-not $apiReady) {
        throw "Nahou local API did not become ready."
    }

    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $env:NAHOU_OFFICE_ADDIN_PFX_PASSWORD = "nahou-local-dev"
    $hostProcess = Start-OwnedProcess -FilePath $node -ArgumentList @(
        (Join-Path $repoRoot "office-addins\tools\serve-office-addin.mjs"),
        $repoRoot,
        $pfxPath,
        "3443",
        "localhost"
    ) -WorkingDirectory $repoRoot -LogStem "office-taskpane-host"
    $httpsReady = Wait-HttpText "https://localhost:3443/office-addins/taskpane.html" "Check Selection" -SkipCertificateCheck
    Add-Check "HttpsTaskpaneReady" $httpsReady "https://localhost:3443/office-addins/taskpane.html"
    if (-not $httpsReady) {
        throw "Office task-pane HTTPS host did not become ready."
    }

    Add-UiAutomationTypes
    Add-User32Types
    Add-Type -AssemblyName System.Windows.Forms

    $noopDevServer = Join-Path $script:RunRoot "noop-dev-server.cmd"
    @("@echo off", "exit /b 0") | Set-Content -LiteralPath $noopDevServer -Encoding ascii
    $npx = (Get-Command npx.cmd -ErrorAction Stop).Source
    $debugArgs = @(
        "--yes",
        "office-addin-debugging",
        "start",
        $manifestPath,
        "desktop",
        "--app",
        $script:HostSlug
    )
    if ($script:HostApp -eq "Word") {
        $debugArgs += @("--document", $wordFixturePath)
    }
    $debugArgs += @(
        "--no-debug",
        "--no-live-reload",
        "--dev-server",
        $noopDevServer,
        "--dev-server-port",
        "3443"
    )
    $debugProcess = Start-OwnedProcess -FilePath $npx -ArgumentList $debugArgs -WorkingDirectory $repoRoot -LogStem "office-debugging"
    Add-Check "OfficeAddinDebuggingStarted" (-not $debugProcess.HasExited) "office-addin-debugging process $($debugProcess.Id)"

    $officeProcess = $null
    $deadline = (Get-Date).AddSeconds(120)
    while ((Get-Date) -lt $deadline) {
        $officeProcess = @(Get-Process -Name $script:ProcessName -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1)[0]
        if ($officeProcess) {
            break
        }
        if ($debugProcess.HasExited) {
            break
        }
        Start-Sleep -Milliseconds 1000
    }
    $script:Result.OfficeProcessIds = @(Get-Process -Name $script:ProcessName -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
    Add-Check "$($script:HostApp)WindowVisible" ($null -ne $officeProcess) ($script:Result.OfficeProcessIds -join ",")
    if (-not $officeProcess) {
        throw "$($script:HostApp) did not open with a visible window."
    }

    [NahouOfficeQaUser32]::SetForegroundWindow($officeProcess.MainWindowHandle) | Out-Null
    Start-Sleep -Seconds 2
    if ($script:HostApp -eq "PowerPoint") {
        $selectionReady = Initialize-PowerPointFixtureSelection
        Add-Check "PresentationSelectionRequested" $selectionReady "Created and selected PowerPoint text fixture."
        if (-not $selectionReady) {
            throw "PowerPoint fixture text could not be selected."
        }
    } else {
        [System.Windows.Forms.SendKeys]::SendWait("^a")
        Start-Sleep -Milliseconds 700
        Add-Check "DocumentSelectionRequested" $true "Sent Ctrl+A to Word fixture."
    }

    $taskpaneReady = $false
    $checkButton = Find-UiaByNameLike "Check Selection" -TimeoutSeconds 8 -ControlTypeName "Button"
    $disabledAddinsMessage = Get-OfficeAddinsDisabledMessage -TimeoutSeconds 2
    if ($disabledAddinsMessage) {
        Add-Check "$($script:HostApp)AddinsEnabled" $false $disabledAddinsMessage
        throw "$($script:HostApp) reports Office add-ins are disabled by the installed Office version or license."
    }
    if (-not $checkButton) {
        $flyout = Find-UiaByAutomationId "OfficeExtensionsShowAddinFlyout" -TimeoutSeconds 20
        Add-Check "OfficeAddinsFlyoutFound" ($null -ne $flyout) "OfficeExtensionsShowAddinFlyout"
        if ($flyout) {
            Invoke-UiaElement $flyout | Out-Null
            Start-Sleep -Seconds 2
            $nahouEntry = Find-UiaByNameLike "Nahou" -TimeoutSeconds 20
            Add-Check "NahouFlyoutEntryFound" ($null -ne $nahouEntry) "Nahou"
            if ($nahouEntry) {
                Invoke-UiaElement $nahouEntry | Out-Null
                Start-Sleep -Seconds 6
            }
        } else {
            Add-Check "OfficeAddinsFlyoutFound" $false "OfficeExtensionsShowAddinFlyout"
        }
        $disabledAddinsMessage = Get-OfficeAddinsDisabledMessage -TimeoutSeconds 2
        if ($disabledAddinsMessage) {
            Add-Check "$($script:HostApp)AddinsEnabled" $false $disabledAddinsMessage
            throw "$($script:HostApp) reports Office add-ins are disabled by the installed Office version or license."
        }
        $checkButton = Find-UiaByNameLike "Check Selection" -TimeoutSeconds 45 -ControlTypeName "Button"
    }
    Add-Check "$($script:HostApp)AddinsEnabled" $true "No disabled-add-ins banner detected."
    $taskpaneReady = $null -ne $checkButton
    Add-Check "TaskpaneCheckButtonVisible" $taskpaneReady "Check Selection"
    if (-not $taskpaneReady) {
        throw "Nahou task pane was not visible in $($script:HostApp)."
    }

    Invoke-UiaElement $checkButton | Out-Null
    Start-Sleep -Seconds 5
    Add-Check "CheckSelectionClicked" $true "Check Selection"

    $applyButton = Find-UiaByNameLike "Apply Safe Fixes" -TimeoutSeconds 30 -ControlTypeName "Button"
    Add-Check "ApplySafeButtonVisible" ($null -ne $applyButton) "Apply Safe Fixes"
    if (-not $applyButton) {
        throw "Apply Safe Fixes button was not visible after checking selection."
    }
    Invoke-UiaElement $applyButton | Out-Null
    Start-Sleep -Seconds 5
    Add-Check "ApplySafeClicked" $true "Apply Safe Fixes"

    $finalText = $null
    for ($attempt = 0; $attempt -lt 12; $attempt++) {
        $finalText = Get-ActiveOfficeText
        if ($finalText) {
            break
        }
        Start-Sleep -Milliseconds 800
    }
    if ($finalText) {
        $script:Result.FinalTextCharCount = $finalText.Length
        $script:Result.FinalTextSha256 = Get-Sha256Text $finalText
    }
    $matchesExpected = $finalText -eq $script:ExpectedText
    Add-Check "FinalTextMatchesExpected" $matchesExpected "charCount=$($script:Result.FinalTextCharCount) sha256=$($script:Result.FinalTextSha256)"
    Add-Check "NoRawPrivateTextInResult" $true "Result records only counts and hashes."

    Save-UiaSnapshot (Join-Path $script:RunRoot "uia-snapshot.json")
    Save-Screenshot (Join-Path $script:RunRoot "$($script:HostSlug)-sideload.png")

    $failedChecks = @($script:Checks.GetEnumerator() | Where-Object { $_.Value -ne $true })
    Write-Result ($failedChecks.Count -eq 0)
} catch {
    $script:Result.Error = $_.Exception.Message
    Save-UiaSnapshot (Join-Path $script:RunRoot "uia-snapshot.json")
    Save-Screenshot (Join-Path $script:RunRoot "$($script:HostSlug)-sideload.png")
    Write-Result $false
    throw
} finally {
    Remove-Item Env:NAHOU_OFFICE_ADDIN_PFX_PASSWORD -ErrorAction SilentlyContinue
    foreach ($processId in $script:OwnedProcessIds) {
        Get-Process -Id $processId -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    }
    $qaOfficeProcesses = @(Get-Process -Name $script:ProcessName -ErrorAction SilentlyContinue)
    foreach ($process in $qaOfficeProcesses) {
        $process | Stop-Process -Force -ErrorAction SilentlyContinue
    }
}
'@
}

function New-RemoteDispatcherScript {
    return @'
param(
    [string]$RunAsUser = "WHITEKNIGHT\aoa",
    [int]$TimeoutSeconds = 420,
    [ValidateSet("Word", "PowerPoint")]
    [string]$HostApp = "Word"
)

$ErrorActionPreference = "Stop"

$runRoot = (Split-Path -Parent $MyInvocation.MyCommand.Path)
$hostSlug = if ($HostApp -eq "PowerPoint") { "powerpoint" } else { "word" }
$runnerPath = Join-Path $runRoot "remote-$hostSlug-sideload.ps1"
$wrapperPath = Join-Path $runRoot "run-interactive-$hostSlug-sideload.ps1"
$consolePath = Join-Path $runRoot "$hostSlug-sideload-console.log"
$resultPath = Join-Path $runRoot "$hostSlug-sideload-result.json"
$taskQueryPath = Join-Path $runRoot "task-query.txt"
$certImportPath = Join-Path $runRoot "cert-import.json"
$taskName = "NahouOffice$($HostApp)Qa-" + (Split-Path -Leaf $runRoot)

$certutil = Join-Path $env:WINDIR "System32\certutil.exe"
$cerPath = Join-Path $runRoot "localhost-office-addin-dev.cer"
$certOutput = & $certutil -addstore Root $cerPath 2>&1
$certExitCode = $LASTEXITCODE
$certImport = [ordered]@{
    ok = $certExitCode -eq 0
    exitCode = [int]$certExitCode
    output = [string](($certOutput | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine).Trim()
    store = "LocalMachine Root"
    certificate = $cerPath
}
$certImport | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $certImportPath -Encoding utf8
if ($certExitCode -ne 0) {
    [pscustomobject]@{
        Ok = $false
        Runner = "WhiteKnight"
        Scenario = "$HostApp sideload selected-text read and safe replacement"
        OfficeHost = $HostApp
        Error = "certutil.exe failed before interactive $HostApp task."
        ReportStoresRawPrivateText = $false
        Checks = [ordered]@{ CertificateImportedWithCertutil = $false }
        Events = @($certImport)
    } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resultPath -Encoding utf8
    exit 2
}

$runnerLiteral = $runnerPath -replace "'", "''"
$runRootLiteral = $runRoot -replace "'", "''"
$consoleLiteral = $consolePath -replace "'", "''"
$wrapper = @"
`$ErrorActionPreference = "Stop"
& '$runnerLiteral' -RunRoot '$runRootLiteral' -HostApp '$HostApp' *> '$consoleLiteral'
"@
$wrapper | Set-Content -LiteralPath $wrapperPath -Encoding utf8

$taskCommand = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + $wrapperPath + '"'
$schtasks = Join-Path $env:WINDIR "System32\schtasks.exe"
$createOutput = & $schtasks /Create /TN $taskName /SC ONCE /ST 23:59 /TR $taskCommand /RU $RunAsUser /IT /F 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Failed to create interactive $HostApp QA scheduled task: $createOutput"
}

try {
    $runOutput = & $schtasks /Run /TN $taskName 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to run interactive $HostApp QA scheduled task: $runOutput"
    }

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-Path -LiteralPath $resultPath) {
            break
        }
        Start-Sleep -Seconds 2
    }

    & $schtasks /Query /TN $taskName /V /FO LIST 2>&1 | Set-Content -LiteralPath $taskQueryPath -Encoding utf8
    if (-not (Test-Path -LiteralPath $resultPath)) {
        [pscustomobject]@{
            Ok = $false
            Runner = "WhiteKnight"
            Scenario = "$HostApp sideload selected-text read and safe replacement"
            OfficeHost = $HostApp
            Error = "Timed out waiting for interactive scheduled task result."
            ReportStoresRawPrivateText = $false
            Checks = [ordered]@{ InteractiveTaskResultWritten = $false }
        } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resultPath -Encoding utf8
        exit 3
    }

    $result = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json
    if ($result.Ok -eq $true) {
        exit 0
    }
    exit 2
} finally {
    & $schtasks /Delete /TN $taskName /F 2>&1 | Out-Null
}
'@
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$localArtifactRootPath = Resolve-RepoPath $LocalArtifactRoot
$hostSlug = if ($HostApp -eq "PowerPoint") { "powerpoint" } else { "word" }
$runId = [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssZ") + "-$hostSlug"
$localRunRoot = Join-Path $localArtifactRootPath $runId
$remoteRunRoot = (Join-Path $RemoteArtifactRoot $runId)

New-Item -ItemType Directory -Force -Path $localRunRoot | Out-Null

$sampleText = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("2YPZitmBINit2KfZhCAg2YXYpyDYp9iu2KjYp9ix"))
$expectedText = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("2YPZitmBINit2KfZhCDZhdinINin2K7YqNin2LE="))

if (-not $SkipCargoBuild) {
    Invoke-Checked "cargo" @("build", "-p", "write-cli", "--release")
}

$resolvedWriteCliPath = Resolve-RepoPath $WriteCliPath
if (-not (Test-Path -LiteralPath $resolvedWriteCliPath)) {
    throw "writecheck.exe not found: $resolvedWriteCliPath. Build it first or pass -WriteCliPath."
}

$repoStage = Join-Path $localRunRoot "repo"
New-Item -ItemType Directory -Force -Path $repoStage | Out-Null
Copy-DirectoryClean (Join-Path $RepoRoot "office-addins") (Join-Path $repoStage "office-addins")
New-Item -ItemType Directory -Force -Path (Join-Path $repoStage "browser-extension\icons") | Out-Null
Copy-Item -LiteralPath (Join-Path $RepoRoot "browser-extension\icons\icon-32.png") -Destination (Join-Path $repoStage "browser-extension\icons\icon-32.png") -Force
Copy-Item -LiteralPath (Join-Path $RepoRoot "browser-extension\icons\icon-128.png") -Destination (Join-Path $repoStage "browser-extension\icons\icon-128.png") -Force
Copy-Item -LiteralPath $resolvedWriteCliPath -Destination (Join-Path $localRunRoot "writecheck.exe") -Force

$certOutDir = Join-Path $localRunRoot "cert"
$certJson = & (Join-Path $PSScriptRoot "New-OfficeAddinDevCertificate.ps1") -OutDir $certOutDir
if (-not $certJson) {
    throw "Failed to create Office add-in localhost certificate."
}
$certInfo = $certJson | ConvertFrom-Json
Copy-Item -LiteralPath $certInfo.PfxPath -Destination (Join-Path $localRunRoot "localhost-office-addin-dev.pfx") -Force
Copy-Item -LiteralPath $certInfo.PublicCertificatePath -Destination (Join-Path $localRunRoot "localhost-office-addin-dev.cer") -Force

$fixturePath = $null
if ($HostApp -eq "Word") {
    $fixturePath = Join-Path $localRunRoot "word-fixture.docx"
    New-WordFixtureDocument -Path $fixturePath -Text $sampleText
}

New-RemoteOfficeRunnerScript | Set-Content -LiteralPath (Join-Path $localRunRoot "remote-$hostSlug-sideload.ps1") -Encoding utf8
New-RemoteDispatcherScript | Set-Content -LiteralPath (Join-Path $localRunRoot "dispatch-$hostSlug-sideload.ps1") -Encoding utf8

$stageManifest = [ordered]@{
    Runner = "WhiteKnight"
    OfficeHost = $HostApp
    Remote = $Remote
    RunAsUser = $RunAsUser
    LocalRunRoot = $localRunRoot
    RemoteRunRoot = $remoteRunRoot
    StageOnly = [bool]$StageOnly
    SampleCharCount = $sampleText.Length
    SampleSha256 = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($sampleText))) -replace "-", ""
    ExpectedCharCount = $expectedText.Length
    ExpectedSha256 = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($expectedText))) -replace "-", ""
    ReportStoresRawPrivateText = $false
    WritecheckSha256 = Get-Sha256Hex (Join-Path $localRunRoot "writecheck.exe")
    FixtureSha256 = if ($fixturePath) { Get-Sha256Hex $fixturePath } else { $null }
    Generated = @(
        "repo\office-addins",
        "repo\browser-extension\icons",
        "writecheck.exe",
        $(if ($fixturePath) { "word-fixture.docx" } else { "powerpoint-fixture-created-at-runtime" }),
        "localhost-office-addin-dev.pfx",
        "localhost-office-addin-dev.cer",
        "remote-$hostSlug-sideload.ps1",
        "dispatch-$hostSlug-sideload.ps1"
    )
}
$stageManifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $localRunRoot "stage-manifest.json") -Encoding utf8

if ($StageOnly) {
    [pscustomobject]$stageManifest | ConvertTo-Json -Depth 8
    return
}

if (-not $SkipReadinessGates) {
    if (-not (Test-Path -LiteralPath $HomelabRoot)) {
        throw "Homelab root not found for WhiteKnight readiness gates: $HomelabRoot"
    }
    Invoke-Checked "npm" @("run", "whiteknight:readiness") $HomelabRoot
    if (-not $SkipDesktopPrepare) {
        Invoke-Checked "npm" @("run", "whiteknight:desktop:prepare") $HomelabRoot
    }
    Invoke-Checked "npm" @("run", "whiteknight:desktop") $HomelabRoot
}

$remoteRunRootForPowerShell = ConvertTo-PowerShellSingleQuoted $remoteRunRoot
$remotePrepareCommand = "powershell -NoProfile -ExecutionPolicy Bypass -Command `"New-Item -ItemType Directory -Force -Path $remoteRunRootForPowerShell | Out-Null`""
Invoke-CapturedNative "ssh" @(
    $Remote,
    $remotePrepareCommand
) (Join-Path $localRunRoot "ssh-prepare.log")

$remoteScpRoot = ConvertTo-WindowsScpPath $remoteRunRoot
foreach ($entry in Get-ChildItem -LiteralPath $localRunRoot) {
    Invoke-CapturedNative "scp" @(
        "-r",
        $entry.FullName,
        "${Remote}:$remoteScpRoot/"
    ) (Join-Path $localRunRoot ("scp-upload-" + $entry.Name.Replace(".", "-") + ".log"))
}

$remoteDispatcher = (Join-Path $remoteRunRoot "dispatch-$hostSlug-sideload.ps1") -replace "\\", "/"
$remoteDispatchLog = Join-Path $localRunRoot "ssh-dispatch.log"
$dispatchOutput = & ssh $Remote "powershell -NoProfile -ExecutionPolicy Bypass -File $remoteDispatcher -RunAsUser $RunAsUser -TimeoutSeconds $TimeoutSeconds -HostApp $HostApp" 2>&1
$dispatchExitCode = $LASTEXITCODE
$dispatchOutput | Set-Content -LiteralPath $remoteDispatchLog -Encoding utf8

$returnedRoot = Join-Path $localRunRoot "returned"
New-Item -ItemType Directory -Force -Path $returnedRoot | Out-Null
$downloadOutput = & scp -r "${Remote}:$remoteScpRoot/*" $returnedRoot 2>&1
$downloadExitCode = $LASTEXITCODE
$downloadOutput | Set-Content -LiteralPath (Join-Path $localRunRoot "scp-download.log") -Encoding utf8
if ($downloadExitCode -ne 0) {
    throw "Failed to download WhiteKnight Office QA artifacts. See $(Join-Path $localRunRoot "scp-download.log")"
}

$resultPath = Join-Path $returnedRoot "$hostSlug-sideload-result.json"
if (-not (Test-Path -LiteralPath $resultPath)) {
    throw "WhiteKnight Office QA result was not returned: $resultPath"
}
$result = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json

$summary = [ordered]@{
    Ok = [bool]$result.Ok
    DispatchExitCode = $dispatchExitCode
    OfficeHost = $HostApp
    LocalRunRoot = $localRunRoot
    RemoteRunRoot = $remoteRunRoot
    ResultPath = $resultPath
    ReportStoresRawPrivateText = [bool]$result.ReportStoresRawPrivateText
    SampleSha256 = $result.SampleSha256
    ExpectedSha256 = $result.ExpectedSha256
    Checks = $result.Checks
}

$summary | ConvertTo-Json -Depth 12
if (-not $result.Ok -and -not $AllowBlocked) {
    throw "WhiteKnight Office $HostApp sideload QA did not pass. See $resultPath"
}
