param(
    [string]$LocalArtifactRoot = "dist\desktop-overlay-whiteknight-qa\target-matrix",
    [string]$BinaryPath = "target\debug\alfaraheedi.exe",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$artifactRoot = if ([IO.Path]::IsPathRooted($LocalArtifactRoot)) {
    $LocalArtifactRoot
} else {
    Join-Path $repoRoot $LocalArtifactRoot
}
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runRoot = Join-Path $artifactRoot "v2b-target-matrix-$timestamp"
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

$summaryPath = Join-Path $runRoot "target-matrix-summary.json"
$tracePath = Join-Path $runRoot "target-matrix-trace.txt"
Set-Content -LiteralPath $tracePath -Value "matrix-start" -Encoding utf8
$script:Results = New-Object System.Collections.Generic.List[object]
$script:Shell = New-Object -ComObject WScript.Shell
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class NahouForegroundWindow {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@

function Add-Trace {
    param([Parameter(Mandatory = $true)] [string]$Message)

    Add-Content -LiteralPath $tracePath -Value "$((Get-Date).ToUniversalTime().ToString("o")) $Message"
}

function Stop-ProcessByCommandLineMarker {
    param([Parameter(Mandatory = $true)] [string]$Marker)

    if ([string]::IsNullOrWhiteSpace($Marker)) {
        return
    }

    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine.Contains($Marker) } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function Activate-ProcessWindow {
    param(
        [Parameter(Mandatory = $true)] [System.Diagnostics.Process]$Process,
        [string]$TitleHint = ""
    )

    for ($attempt = 0; $attempt -lt 10; $attempt++) {
        $Process.Refresh()
        if ($Process.MainWindowHandle -ne [IntPtr]::Zero) {
            [void][NahouForegroundWindow]::ShowWindow($Process.MainWindowHandle, 5)
            [void][NahouForegroundWindow]::SetForegroundWindow($Process.MainWindowHandle)
        }
        [void]$script:Shell.AppActivate([int]$Process.Id)
        if (-not [string]::IsNullOrWhiteSpace($TitleHint)) {
            [void]$script:Shell.AppActivate($TitleHint)
        }
        Start-Sleep -Milliseconds 500
    }
    Start-Sleep -Seconds 1
}

function Add-SetupFailure {
    param(
        [Parameter(Mandatory = $true)] [string]$TargetApp,
        [Parameter(Mandatory = $true)] [string]$Fixture,
        [Parameter(Mandatory = $true)] [string]$ErrorText
    )

    $script:Results.Add([pscustomobject]@{
        target = $TargetApp
        fixture = $Fixture
        status = "failed_setup"
        support = $null
        monitor_present = $null
        text_pattern_supported = $null
        value_pattern_supported = $null
        visible_range_rect_count = $null
        control_class = $null
        support_allowed = $false
        error = $ErrorText
    })
    Add-Trace "setup-failed $TargetApp"
}

function Invoke-TargetSafely {
    param(
        [Parameter(Mandatory = $true)] [string]$TargetApp,
        [Parameter(Mandatory = $true)] [string]$Fixture,
        [Parameter(Mandatory = $true)] [scriptblock]$ScriptBlock
    )

    try {
        & $ScriptBlock
    } catch {
        Add-SetupFailure -TargetApp $TargetApp -Fixture $Fixture -ErrorText (($_ | Out-String).Trim())
    }
}

function Invoke-ProbeForTarget {
    param(
        [Parameter(Mandatory = $true)] [string]$TargetApp,
        [Parameter(Mandatory = $true)] [string]$Fixture,
        [Parameter(Mandatory = $true)] [string[]]$AllowedSupport
    )

    Add-Trace "probe-start $TargetApp"
    try {
        $output = & (Join-Path $PSScriptRoot "qa-desktop-overlay-whiteknight.ps1") `
            -SkipBuild:$SkipBuild `
            -BinaryPath $BinaryPath `
            -ObservedTargetApp $TargetApp `
            -ObservedFixture $Fixture `
            -AllowedSupport $AllowedSupport `
            -RunLabel "v2b-$($TargetApp.ToLowerInvariant())" 2>&1
        $manifestText = ($output | Out-String).Trim()
        $manifest = $manifestText | ConvertFrom-Json
        $script:Results.Add([pscustomobject]@{
            target = $TargetApp
            fixture = $Fixture
            status = "captured"
            support = $manifest.ProbeResult.Support
            monitor_present = $manifest.ProbeResult.MonitorPresent
            text_pattern_supported = $manifest.ProbeResult.TextPatternSupported
            value_pattern_supported = $manifest.ProbeResult.ValuePatternSupported
            visible_range_rect_count = $manifest.ProbeResult.VisibleRangeRectCount
            control_class = $manifest.ProbeResult.ControlClass
            support_allowed = $manifest.ProbeResult.SupportAllowed
            run_root = $manifest.RunRoot
        })
        Add-Trace "probe-ok $TargetApp support=$($manifest.ProbeResult.Support)"
    } catch {
        $script:Results.Add([pscustomobject]@{
            target = $TargetApp
            fixture = $Fixture
            status = "failed"
            support = $null
            monitor_present = $null
            text_pattern_supported = $null
            value_pattern_supported = $null
            visible_range_rect_count = $null
            control_class = $null
            support_allowed = $false
            error = ($_ | Out-String).Trim()
        })
        Add-Trace "probe-failed $TargetApp"
    }
}

function Invoke-NotepadProbe {
    $fixturePath = Join-Path $runRoot "notepad-public-safe.txt"
    Set-Content -LiteralPath $fixturePath -Value "Public safe V2B Notepad fixture." -Encoding utf8
    $process = Start-Process -FilePath (Join-Path $env:WINDIR "System32\notepad.exe") -ArgumentList $fixturePath -PassThru
    try {
        Start-Sleep -Seconds 3
        Activate-ProcessWindow -Process $process -TitleHint "notepad-public-safe"
        Invoke-ProbeForTarget `
            -TargetApp "Notepad" `
            -Fixture "public-safe-notepad-edit" `
            -AllowedSupport @("fallback", "supported")
    } finally {
        if ($process -and -not $process.HasExited) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        }
    }
}

function Invoke-WordProbe {
    $word = $null
    try {
        $word = New-Object -ComObject Word.Application
        $word.Visible = $true
        $document = $word.Documents.Add()
        $word.Selection.TypeText("Public safe V2B Word fixture.")
        $document.Saved = $true
        $word.Activate()
        $document.Activate()
        $process = Get-Process WINWORD -ErrorAction SilentlyContinue |
            Sort-Object StartTime -Descending |
            Select-Object -First 1
        if ($process) {
            Activate-ProcessWindow -Process $process -TitleHint "Word"
        } else {
            Start-Sleep -Seconds 2
        }
        Invoke-ProbeForTarget `
            -TargetApp "Word" `
            -Fixture "public-safe-word-document-body" `
            -AllowedSupport @("fallback", "supported")
    } finally {
        if ($word) {
            try {
                $saveChanges = 0
                $word.Quit([ref]$saveChanges) | Out-Null
            } catch {
                Add-Trace "word-quit-warning"
            }
        }
    }
}

function Invoke-PowerPointProbe {
    $powerPoint = $null
    try {
        $msoTrue = -1
        $msoTextOrientationHorizontal = 1
        $ppLayoutBlank = 12
        $powerPoint = New-Object -ComObject PowerPoint.Application
        $powerPoint.Visible = $msoTrue
        $presentation = $powerPoint.Presentations.Add($msoTrue)
        $slide = $presentation.Slides.Add(1, $ppLayoutBlank)
        $shape = $slide.Shapes.AddTextbox($msoTextOrientationHorizontal, 100, 100, 420, 90)
        $shape.TextFrame.TextRange.Text = "Public safe V2B PowerPoint fixture."
        $presentation.Saved = $msoTrue
        $powerPoint.Activate()
        $shape.Select()
        $shape.TextFrame.TextRange.Select()
        $process = Get-Process POWERPNT -ErrorAction SilentlyContinue |
            Sort-Object StartTime -Descending |
            Select-Object -First 1
        if ($process) {
            Activate-ProcessWindow -Process $process -TitleHint "PowerPoint"
        } else {
            Start-Sleep -Seconds 2
        }
        Invoke-ProbeForTarget `
            -TargetApp "PowerPoint" `
            -Fixture "public-safe-powerpoint-text-box" `
            -AllowedSupport @("fallback", "supported")
    } finally {
        if ($powerPoint) {
            try {
                $powerPoint.Quit() | Out-Null
            } catch {
                Add-Trace "powerpoint-quit-warning"
            }
        }
    }
}

function Invoke-EdgeProbe {
    $edgeCandidates = @(
        "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        "C:\Program Files\Google\Chrome\Application\chrome.exe",
        "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
    )
    $browser = $edgeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $browser) {
        $script:Results.Add([pscustomobject]@{
            target = "EdgeOrChrome"
            fixture = "public-safe-browser-text-field"
            status = "blocked_unavailable"
            support = "blocked"
            monitor_present = $false
            text_pattern_supported = $false
            value_pattern_supported = $false
            visible_range_rect_count = 0
            control_class = $null
            support_allowed = $true
        })
        return
    }

    $profile = Join-Path $runRoot "browser-profile"
    $htmlPath = Join-Path $runRoot "browser-public-safe.html"
    $html = '<!doctype html><meta charset="utf-8"><title>Nahou V2B public-safe browser fixture</title><textarea autofocus style="width:600px;height:160px">Public safe V2B browser fixture.</textarea>'
    Set-Content -LiteralPath $htmlPath -Encoding utf8 -Value $html
    $uri = "file:///" + ((Resolve-Path -LiteralPath $htmlPath).Path -replace "\\", "/")
    $process = Start-Process -FilePath $browser -ArgumentList @("--user-data-dir=$profile", "--new-window", $uri) -PassThru
    try {
        Start-Sleep -Seconds 5
        if ($process -and -not $process.HasExited) {
            Activate-ProcessWindow -Process $process -TitleHint "Nahou V2B public-safe browser fixture"
        }
        Invoke-ProbeForTarget `
            -TargetApp "EdgeOrChrome" `
            -Fixture "public-safe-browser-text-field" `
            -AllowedSupport @("fallback")
    } finally {
        Stop-ProcessByCommandLineMarker -Marker $profile
    }
}

function Invoke-ElectronProbe {
    $codeCandidates = @(
        "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe",
        "C:\Program Files\Microsoft VS Code\Code.exe"
    )
    $code = $codeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $code) {
        $script:Results.Add([pscustomobject]@{
            target = "Electron"
            fixture = "public-safe-electron-vscode-editor"
            status = "blocked_unavailable"
            support = "blocked"
            monitor_present = $false
            text_pattern_supported = $false
            value_pattern_supported = $false
            visible_range_rect_count = 0
            control_class = $null
            support_allowed = $true
        })
        return
    }

    $profile = Join-Path $runRoot "vscode-user-data"
    $extensions = Join-Path $runRoot "vscode-extensions"
    $fixturePath = Join-Path $runRoot "vscode-public-safe.txt"
    Set-Content -LiteralPath $fixturePath -Value "Public safe V2B VS Code fixture." -Encoding utf8
    $process = Start-Process -FilePath $code -ArgumentList @("--user-data-dir", $profile, "--extensions-dir", $extensions, "--new-window", $fixturePath) -PassThru
    try {
        Start-Sleep -Seconds 7
        if ($process -and -not $process.HasExited) {
            Activate-ProcessWindow -Process $process -TitleHint "vscode-public-safe"
        }
        Invoke-ProbeForTarget `
            -TargetApp "Electron" `
            -Fixture "public-safe-electron-vscode-editor" `
            -AllowedSupport @("fallback", "blocked")
    } finally {
        Stop-ProcessByCommandLineMarker -Marker $profile
    }
}

try {
    if (-not $SkipBuild) {
        Push-Location $repoRoot
        try {
            cargo build -p alfaraheedi-desktop --bin alfaraheedi
            if ($LASTEXITCODE -ne 0) {
                throw "Desktop binary build failed with exit code $LASTEXITCODE"
            }
        } finally {
            Pop-Location
        }
    }

    Invoke-TargetSafely -TargetApp "Notepad" -Fixture "public-safe-notepad-edit" -ScriptBlock { Invoke-NotepadProbe }
    Invoke-TargetSafely -TargetApp "Word" -Fixture "public-safe-word-document-body" -ScriptBlock { Invoke-WordProbe }
    Invoke-TargetSafely -TargetApp "PowerPoint" -Fixture "public-safe-powerpoint-text-box" -ScriptBlock { Invoke-PowerPointProbe }
    Invoke-TargetSafely -TargetApp "EdgeOrChrome" -Fixture "public-safe-browser-text-field" -ScriptBlock { Invoke-EdgeProbe }
    Invoke-TargetSafely -TargetApp "Electron" -Fixture "public-safe-electron-vscode-editor" -ScriptBlock { Invoke-ElectronProbe }
} finally {
    $summary = [ordered]@{
        GeneratedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
        RepoRoot = $repoRoot.Path
        RunRoot = $runRoot
        Privacy = "Public-safe fixture names and sanitized probe metadata only. No raw user text, screenshots, private titles, account data, tokens, or clipboard content."
        Results = $script:Results
    }
    $summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $summaryPath -Encoding utf8
    Add-Trace "matrix-finished"
}

Get-Content -LiteralPath $summaryPath
