param(
    [Parameter(Mandatory = $true)]
    [string]$VmName,

    [Parameter(Mandatory = $true)]
    [string]$CredentialPath,

    [ValidateSet('Edge', 'ChromeForTesting', 'InstalledChrome')]
    [string]$Browser = 'Edge',

    [string]$ChromeForTestingZipPath = "",

    [string]$ZipPath = "dist\browser-extension\alfaraheedi-browser-extension-0.7.0.zip",

    [string]$QaRoot = ""
)

$ErrorActionPreference = 'Stop'

function Resolve-RepoPath {
    param([Parameter(Mandatory = $true)] [string]$Path)
    if ([IO.Path]::IsPathRooted($Path)) {
        return $Path
    }
    return Join-Path (Get-Location) $Path
}

function New-GuestQaRoot {
    param([Parameter(Mandatory = $true)] [string]$RunName)

    $baseRoot = $env:ALFARAHEEDI_VM_QA_ROOT
    if (-not $baseRoot) {
        $systemDrive = if ($env:SystemDrive) { $env:SystemDrive } else { "C:" }
        $baseRoot = Join-Path ($systemDrive.TrimEnd("\") + "\") "Temp\Alfaraheedi"
    }

    return (Join-Path $baseRoot ("v0.7-extension-$RunName-" + (Get-Date -Format 'yyyyMMdd-HHmmss')))
}

if (-not $QaRoot) {
    $QaRoot = New-GuestQaRoot "keyboard-flow-smoke"
}

$resolvedZipPath = Resolve-RepoPath $ZipPath
if (-not (Test-Path -LiteralPath $resolvedZipPath)) {
    throw "Extension zip not found: $resolvedZipPath"
}

$resolvedChromeForTestingZipPath = ""
if ($ChromeForTestingZipPath) {
    $resolvedChromeForTestingZipPath = Resolve-RepoPath $ChromeForTestingZipPath
    if (-not (Test-Path -LiteralPath $resolvedChromeForTestingZipPath)) {
        throw "Chrome for Testing zip not found: $resolvedChromeForTestingZipPath"
    }
}

$cred = Import-Clixml -LiteralPath $CredentialPath
$session = New-PSSession -VMName $VmName -Credential $cred
try {
    Invoke-Command -Session $session -ScriptBlock {
        param($Root)
        New-Item -ItemType Directory -Force -Path $Root | Out-Null
    } -ArgumentList $QaRoot

    Copy-Item -ToSession $session -LiteralPath $resolvedZipPath -Destination (Join-Path $QaRoot 'extension.zip') -Force
    if ($resolvedChromeForTestingZipPath) {
        Copy-Item -ToSession $session -LiteralPath $resolvedChromeForTestingZipPath -Destination (Join-Path $QaRoot 'chrome-for-testing.zip') -Force
    }

    Invoke-Command -Session $session -ScriptBlock {
        param($Root, $Browser)

        $ErrorActionPreference = 'Stop'

        function Invoke-Cdp {
            param(
                [Parameter(Mandatory = $true)] [System.Net.WebSockets.ClientWebSocket] $Socket,
                [Parameter(Mandatory = $true)] [int] $Id,
                [Parameter(Mandatory = $true)] [string] $Method,
                [Parameter(Mandatory = $true)] $Params
            )

            $payload = @{ id = $Id; method = $Method; params = $Params } | ConvertTo-Json -Depth 30 -Compress
            $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
            $Socket.SendAsync(
                [ArraySegment[byte]]::new($bytes),
                [Net.WebSockets.WebSocketMessageType]::Text,
                $true,
                [Threading.CancellationToken]::None
            ).GetAwaiter().GetResult() | Out-Null

            $deadline = (Get-Date).AddSeconds(30)
            while ((Get-Date) -lt $deadline) {
                $stream = [IO.MemoryStream]::new()
                $timedOut = $false
                do {
                    $buffer = New-Object byte[] 262144
                    $cts = [Threading.CancellationTokenSource]::new()
                    $cts.CancelAfter(3000)
                    try {
                        $result = $Socket.ReceiveAsync(
                            [ArraySegment[byte]]::new($buffer),
                            $cts.Token
                        ).GetAwaiter().GetResult()
                    } catch {
                        $timedOut = $true
                        break
                    } finally {
                        $cts.Dispose()
                    }

                    $stream.Write($buffer, 0, $result.Count)
                } while (-not $result.EndOfMessage)
                if ($timedOut) {
                    continue
                }

                $text = [Text.Encoding]::UTF8.GetString($stream.ToArray())
                $message = $text | ConvertFrom-Json
                if ($message.PSObject.Properties.Name -contains 'id' -and $message.id -eq $Id) {
                    return $message
                }
            }

            throw "Timed out waiting for CDP response $Id $Method"
        }

        function Invoke-Key {
            param(
                [Parameter(Mandatory = $true)] [System.Net.WebSockets.ClientWebSocket] $Socket,
                [Parameter(Mandatory = $true)] [ref] $Id,
                [Parameter(Mandatory = $true)] [string] $Key,
                [Parameter(Mandatory = $true)] [string] $Code,
                [Parameter(Mandatory = $true)] [int] $VirtualKeyCode
            )

            $downId = $Id.Value
            $null = Invoke-Cdp $Socket $downId 'Input.dispatchKeyEvent' @{
                type = 'keyDown'
                key = $Key
                code = $Code
                windowsVirtualKeyCode = $VirtualKeyCode
                nativeVirtualKeyCode = $VirtualKeyCode
            }
            $Id.Value = $Id.Value + 1

            $upId = $Id.Value
            $null = Invoke-Cdp $Socket $upId 'Input.dispatchKeyEvent' @{
                type = 'keyUp'
                key = $Key
                code = $Code
                windowsVirtualKeyCode = $VirtualKeyCode
                nativeVirtualKeyCode = $VirtualKeyCode
            }
            $Id.Value = $Id.Value + 1
        }

        function Get-FocusSnapshot {
            param(
                [Parameter(Mandatory = $true)] [System.Net.WebSockets.ClientWebSocket] $Socket,
                [Parameter(Mandatory = $true)] [ref] $Id
            )

            $expression = @'
(() => {
  const element = document.activeElement;
  return {
    id: element?.id || "",
    tag: element?.tagName || "",
    type: element?.getAttribute("type") || "",
    ariaLabel: element?.getAttribute("aria-label") || "",
    text: (element?.textContent || "").trim(),
    value: element?.value || ""
  };
})()
'@
            $response = Invoke-Cdp $Socket $Id.Value 'Runtime.evaluate' @{
                expression = $expression
                returnByValue = $true
            }
            $Id.Value = $Id.Value + 1
            return $response.result.result.value
        }

        function Wait-HttpText {
            param(
                [Parameter(Mandatory = $true)] [string] $Url,
                [Parameter(Mandatory = $true)] [string] $Contains
            )
            $webClient = [Net.WebClient]::new()
            for ($i = 0; $i -lt 40; $i++) {
                try {
                    $content = $webClient.DownloadString($Url)
                    if ($content -like "*$Contains*") {
                        return $true
                    }
                } catch {
                    Start-Sleep -Milliseconds 250
                }
            }
            return $false
        }

        function Resolve-BrowserExecutable {
            param([Parameter(Mandatory = $true)] [string] $Name)

            if ($Name -eq 'Edge') {
                $edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
                if (-not (Test-Path -LiteralPath $edgePath)) {
                    throw "Microsoft Edge not found at $edgePath"
                }
                return [pscustomobject]@{
                    Name = 'Edge'
                    Executable = $edgePath
                    Version = (Get-Item -LiteralPath $edgePath).VersionInfo.ProductVersion
                }
            }

            if ($Name -eq 'InstalledChrome') {
                $chromePath = @(
                    'C:\Program Files\Google\Chrome\Application\chrome.exe',
                    'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
                ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
                if (-not $chromePath) {
                    throw 'Installed Google Chrome was not found in the standard Program Files locations.'
                }
                return [pscustomobject]@{
                    Name = 'InstalledChrome'
                    Executable = $chromePath
                    Version = (Get-Item -LiteralPath $chromePath).VersionInfo.ProductVersion
                }
            }

            $toolsRoot = Join-Path (Split-Path -Parent $Root) 'tools'
            New-Item -ItemType Directory -Force -Path $toolsRoot | Out-Null
            $providedZip = Join-Path $Root 'chrome-for-testing.zip'
            if (Test-Path -LiteralPath $providedZip) {
                $providedRoot = Join-Path $Root 'chrome-for-testing'
                New-Item -ItemType Directory -Force -Path $providedRoot | Out-Null
                Expand-Archive -LiteralPath $providedZip -DestinationPath $providedRoot -Force
                $providedChromePath = @(
                    Get-ChildItem -LiteralPath $providedRoot -Recurse -Filter chrome.exe |
                        Where-Object { $_.FullName -like '*chrome-win64*' } |
                        Select-Object -First 1
                )[0]
                if (-not $providedChromePath) {
                    throw "Chrome for Testing executable not found in provided zip: $providedZip"
                }
                return [pscustomobject]@{
                    Name = 'ChromeForTesting'
                    Executable = $providedChromePath.FullName
                    Version = (Get-Item -LiteralPath $providedChromePath.FullName).VersionInfo.ProductVersion
                }
            }

            $metadataUrl = 'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json'
            $metadata = Invoke-RestMethod -Uri $metadataUrl -TimeoutSec 30
            $stable = $metadata.channels.Stable
            $download = @($stable.downloads.chrome | Where-Object { $_.platform -eq 'win64' } | Select-Object -First 1)[0]
            if (-not $download) {
                throw 'Chrome for Testing win64 download was not present in the stable metadata.'
            }

            $browserRoot = Join-Path $toolsRoot ("chrome-for-testing-" + $stable.version)
            $browserZip = Join-Path $toolsRoot ("chrome-for-testing-" + $stable.version + ".zip")
            $chromePath = Join-Path $browserRoot 'chrome-win64\chrome.exe'
            if (-not (Test-Path -LiteralPath $chromePath)) {
                if (-not (Test-Path -LiteralPath $browserZip)) {
                    Invoke-WebRequest -Uri $download.url -OutFile $browserZip -TimeoutSec 120
                }
                New-Item -ItemType Directory -Force -Path $browserRoot | Out-Null
                Expand-Archive -LiteralPath $browserZip -DestinationPath $browserRoot -Force
            }
            if (-not (Test-Path -LiteralPath $chromePath)) {
                throw "Chrome for Testing executable not found after download: $chromePath"
            }

            return [pscustomobject]@{
                Name = 'ChromeForTesting'
                Executable = $chromePath
                Version = $stable.version
            }
        }

        $browserInfo = Resolve-BrowserExecutable $Browser
        $browserExe = $browserInfo.Executable
        $python = (Get-Command python -ErrorAction Stop).Source
        $extensionDir = Join-Path $Root 'extension'
        $profileDir = Join-Path $Root 'profile'
        $serverPy = Join-Path $Root 'qa_server.py'
        $apiPort = 3498
        $pagePort = 41098
        $cdpPort = 9298

        New-Item -ItemType Directory -Force -Path $extensionDir, $profileDir | Out-Null
        Expand-Archive -LiteralPath (Join-Path $Root 'extension.zip') -DestinationPath $extensionDir -Force

@'
import json
import sys
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

mode = sys.argv[1]
port = int(sys.argv[2])

PAGE = """<!doctype html>
<meta charset="utf-8">
<title>Keyboard fixture</title>
<style>
  body { margin: 32px; font: 16px/1.45 system-ui, sans-serif; }
  textarea { display: block; height: 120px; width: 460px; }
</style>
<label for="draft">Draft</label>
<textarea id="draft">helo wat you are do?</textarea>
"""

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return

    def _send(self, status, body, content_type):
        data = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.end_headers()

    def do_GET(self):
        if mode == "page":
            self._send(200, PAGE, "text/html; charset=utf-8")
        else:
            self._send(200, '{"status":"ok","service":"mock-write-api"}', "application/json; charset=utf-8")

    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        self.rfile.read(length)
        payload = {
            "suggestions": [
                {
                    "source": "english:common-typo",
                    "original": "helo",
                    "span": {"start_utf16": 0, "end_utf16": 4},
                    "replacements": ["hello"],
                    "explanation": "Fixes a common typo."
                }
            ]
        }
        self._send(200, json.dumps(payload), "application/json; charset=utf-8")

ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
'@ | Set-Content -LiteralPath $serverPy -Encoding UTF8

        Get-Process -Name msedge -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

        $apiProcess = $null
        $pageProcess = $null
        $browserProcess = $null
        try {
            $apiProcess = Start-Process -FilePath $python -ArgumentList @($serverPy, 'api', [string]$apiPort) -PassThru -WindowStyle Hidden
            $pageProcess = Start-Process -FilePath $python -ArgumentList @($serverPy, 'page', [string]$pagePort) -PassThru -WindowStyle Hidden
            if (-not (Wait-HttpText "http://127.0.0.1:$apiPort/v1/health" 'mock-write-api')) {
                throw 'Mock API did not become ready.'
            }
            if (-not (Wait-HttpText "http://127.0.0.1:$pagePort/" 'Keyboard fixture')) {
                throw 'Keyboard fixture page did not become ready.'
            }

            $browserProcess = Start-Process -FilePath $browserExe -ArgumentList @(
                '--headless=new',
                '--disable-gpu',
                '--disable-background-networking',
                '--disable-component-extensions-with-background-pages',
                '--disable-features=DisableLoadExtensionCommandLineSwitch',
                '--no-first-run',
                '--no-default-browser-check',
                "--user-data-dir=$profileDir",
                "--disable-extensions-except=$extensionDir",
                "--load-extension=$extensionDir",
                '--remote-debugging-address=127.0.0.1',
                "--remote-debugging-port=$cdpPort",
                '--window-size=1280,800',
                'about:blank'
            ) -PassThru -WindowStyle Hidden

            $targets = $null
            $serviceWorker = $null
            for ($i = 0; $i -lt 80; $i++) {
                try {
                    $targets = Invoke-RestMethod "http://127.0.0.1:$cdpPort/json" -TimeoutSec 1
                    $serviceWorker = @(
                        $targets |
                            Where-Object { $_.type -eq 'service_worker' -and $_.url -like 'chrome-extension://*/*' } |
                            Select-Object -First 1
                    )[0]
                    if ($serviceWorker) {
                        break
                    }
                } catch {}
                if ($browserProcess.HasExited) {
                    throw "$($browserInfo.Name) exited early $($browserProcess.ExitCode)"
                }
                Start-Sleep -Milliseconds 250
            }
            if (-not $serviceWorker) {
                throw ('Alfaraheedi service worker target not found. Targets=' + (($targets | Select-Object type, title, url) | ConvertTo-Json -Compress))
            }
            $extensionId = ([uri]$serviceWorker.url).Host

            $target = Invoke-RestMethod -Method Put "http://127.0.0.1:$cdpPort/json/new?chrome-extension://$extensionId/options.html"
            $socket = [System.Net.WebSockets.ClientWebSocket]::new()
            $socket.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
            $id = 1
            try {
                Start-Sleep -Milliseconds 800
                $configureExpression = @"
new Promise((resolve) => {
  chrome.storage.local.set({
    alfaraheediSettings: {
      apiBaseUrl: 'http://127.0.0.1:$apiPort',
      writingMode: 'english',
      enabled: true
    }
  }, () => resolve(chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Saved.'));
})
"@
                $settingsStatus = (Invoke-Cdp $socket $id 'Runtime.evaluate' @{
                    expression = $configureExpression
                    awaitPromise = $true
                    returnByValue = $true
                }).result.result.value
                $id += 1

                $null = Invoke-Cdp $socket $id 'Page.navigate' @{ url = "chrome-extension://$extensionId/options.html" }
                $id += 1
                Start-Sleep -Milliseconds 800
                $null = Invoke-Cdp $socket $id 'Runtime.evaluate' @{
                    expression = "document.getElementById('api-base-url').focus();"
                    returnByValue = $true
                }
                $id += 1
                $optionsFocus = @()
                $optionsFocus += Get-FocusSnapshot $socket ([ref]$id)
                Invoke-Key $socket ([ref]$id) 'Tab' 'Tab' 9
                $optionsFocus += Get-FocusSnapshot $socket ([ref]$id)
                Invoke-Key $socket ([ref]$id) 'Tab' 'Tab' 9
                $optionsFocus += Get-FocusSnapshot $socket ([ref]$id)
                Invoke-Key $socket ([ref]$id) 'Tab' 'Tab' 9
                $optionsFocus += Get-FocusSnapshot $socket ([ref]$id)

                $null = Invoke-Cdp $socket $id 'Page.navigate' @{ url = "chrome-extension://$extensionId/popup.html" }
                $id += 1
                Start-Sleep -Milliseconds 1200
                $null = Invoke-Cdp $socket $id 'Runtime.evaluate' @{
                    expression = "document.getElementById('toggle-enabled').focus();"
                    returnByValue = $true
                }
                $id += 1
                $popupFocus = @()
                $popupFocus += Get-FocusSnapshot $socket ([ref]$id)
                Invoke-Key $socket ([ref]$id) 'Tab' 'Tab' 9
                $popupFocus += Get-FocusSnapshot $socket ([ref]$id)

                $null = Invoke-Cdp $socket $id 'Page.navigate' @{ url = "http://127.0.0.1:$pagePort/" }
                $id += 1
                Start-Sleep -Milliseconds 1000
                $startPanelExpression = @'
(() => {
  const textarea = document.getElementById('draft');
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '?' }));
  return textarea.value;
})()
'@
                $null = Invoke-Cdp $socket $id 'Runtime.evaluate' @{
                    expression = $startPanelExpression
                    returnByValue = $true
                }
                $id += 1
                Start-Sleep -Milliseconds 1800
                $panelBefore = (Invoke-Cdp $socket $id 'Runtime.evaluate' @{
                    expression = "document.querySelector('[data-alfaraheedi-panel] button')?.getAttribute('aria-label') || null"
                    returnByValue = $true
                }).result.result.value
                $id += 1
                Invoke-Key $socket ([ref]$id) 'Tab' 'Tab' 9
                $panelFocus = Get-FocusSnapshot $socket ([ref]$id)
                Invoke-Key $socket ([ref]$id) ' ' 'Space' 32
                Start-Sleep -Milliseconds 500
                $panelAfter = (Invoke-Cdp $socket $id 'Runtime.evaluate' @{
                    expression = @'
(() => ({
  value: document.getElementById('draft').value,
  panelCount: document.querySelectorAll('[data-alfaraheedi-panel]').length,
  activeAriaLabel: document.activeElement?.getAttribute('aria-label') || ''
}))()
'@
                    returnByValue = $true
                }).result.result.value
            } finally {
                $socket.Dispose()
            }

            $checks = [ordered]@{
                SettingsWritten = $settingsStatus -eq 'Saved.'
                OptionsApiFirst = $optionsFocus[0].id -eq 'api-base-url'
                OptionsWritingModeSecond = $optionsFocus[1].id -eq 'writing-mode'
                OptionsEnabledThird = $optionsFocus[2].id -eq 'enabled'
                OptionsSaveFourth = $optionsFocus[3].tag -eq 'BUTTON' -and $optionsFocus[3].text -eq 'Save'
                PopupToggleFirst = $popupFocus[0].id -eq 'toggle-enabled' -and $popupFocus[0].text -eq 'Pause checking'
                PopupOptionsSecond = $popupFocus[1].id -eq 'open-options'
                PanelButtonRendered = $panelBefore -eq 'Apply suggestion: hello'
                PanelButtonFocusedByTab = $panelFocus.ariaLabel -eq 'Apply suggestion: hello'
                PanelKeyboardAppliesSuggestion = $panelAfter.value -eq 'hello wat you are do?'
                PanelRemovedAfterApply = $panelAfter.panelCount -eq 0
            }
            $ok = -not @($checks.GetEnumerator() | Where-Object { $_.Value -ne $true })

            [pscustomobject]@{
                Ok = $ok
                QaRoot = $Root
                Browser = $browserInfo.Name
                BrowserExecutable = $browserInfo.Executable
                BrowserVersion = $browserInfo.Version
                ExtensionId = $extensionId
                SettingsStatus = $settingsStatus
                OptionsFocus = $optionsFocus
                PopupFocus = $popupFocus
                PanelBefore = $panelBefore
                PanelFocus = $panelFocus
                PanelAfter = $panelAfter
                Checks = $checks
            } | ConvertTo-Json -Depth 20
            if (-not $ok) {
                throw "Keyboard flow packaged smoke failed. See JSON output above."
            }
        } finally {
            if ($browserProcess -and -not $browserProcess.HasExited) {
                $browserProcess | Stop-Process -Force -ErrorAction SilentlyContinue
            }
            if ($apiProcess -and -not $apiProcess.HasExited) {
                $apiProcess | Stop-Process -Force -ErrorAction SilentlyContinue
            }
            if ($pageProcess -and -not $pageProcess.HasExited) {
                $pageProcess | Stop-Process -Force -ErrorAction SilentlyContinue
            }
            Get-Process -Name msedge -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
            Get-Process -Name chrome -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        }
    } -ArgumentList $QaRoot, $Browser
} finally {
    Remove-PSSession $session
}
