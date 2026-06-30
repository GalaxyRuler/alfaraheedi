param(
    [Parameter(Mandatory = $true)]
    [string]$VmName,

    [Parameter(Mandatory = $true)]
    [string]$CredentialPath,

    [string]$ZipPath = "dist\browser-extension\nahou-browser-extension-2.0.0.1.zip",

    [string]$OutDir = "dist\browser-extension-store-assets",

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
        $baseRoot = Join-Path ($systemDrive.TrimEnd("\") + "\") "Temp\Nahou"
    }

    return (Join-Path $baseRoot ("v0.7-extension-$RunName-" + (Get-Date -Format 'yyyyMMdd-HHmmss')))
}

if (-not $QaRoot) {
    $QaRoot = New-GuestQaRoot "store-screenshots"
}

$resolvedZipPath = Resolve-RepoPath $ZipPath
$resolvedOutDir = Resolve-RepoPath $OutDir
if (-not (Test-Path -LiteralPath $resolvedZipPath)) {
    throw "Extension zip not found: $resolvedZipPath"
}

$cred = Import-Clixml -LiteralPath $CredentialPath
$session = New-PSSession -VMName $VmName -Credential $cred
try {
    Invoke-Command -Session $session -ScriptBlock {
        param($Root)
        New-Item -ItemType Directory -Force -Path $Root | Out-Null
    } -ArgumentList $QaRoot

    Copy-Item -ToSession $session -LiteralPath $resolvedZipPath -Destination (Join-Path $QaRoot 'extension.zip') -Force

    $resultJson = Invoke-Command -Session $session -ScriptBlock {
        param($Root)

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

            $deadline = (Get-Date).AddSeconds(20)
            while ((Get-Date) -lt $deadline) {
                $stream = [IO.MemoryStream]::new()
                $timedOut = $false
                do {
                    $buffer = New-Object byte[] 262144
                    $task = $Socket.ReceiveAsync(
                        [ArraySegment[byte]]::new($buffer),
                        [Threading.CancellationToken]::None
                    )
                    if (-not $task.Wait(3000)) {
                        $timedOut = $true
                        break
                    }

                    $result = $task.Result
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

        function Save-Screenshot {
            param(
                [Parameter(Mandatory = $true)] [System.Net.WebSockets.ClientWebSocket] $Socket,
                [Parameter(Mandatory = $true)] [int] $Id,
                [Parameter(Mandatory = $true)] [string] $Path
            )
            $capture = Invoke-Cdp $Socket $Id 'Page.captureScreenshot' @{
                format = 'png'
                captureBeyondViewport = $false
            }
            [IO.File]::WriteAllBytes($Path, [Convert]::FromBase64String($capture.result.data))
        }

        $edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
        $python = (Get-Command python -ErrorAction Stop).Source
        $extensionDir = Join-Path $Root 'extension'
        $profileDir = Join-Path $Root 'profile'
        $screenshotsDir = Join-Path $Root 'screenshots'
        $serverPy = Join-Path $Root 'qa_server.py'
        $apiPort = 3478
        $pagePort = 41078
        $cdpPort = 9278

        New-Item -ItemType Directory -Force -Path $extensionDir, $profileDir, $screenshotsDir | Out-Null
        Expand-Archive -LiteralPath (Join-Path $Root 'extension.zip') -DestinationPath $extensionDir -Force

@'
import json
import sys
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

mode = sys.argv[1]
port = int(sys.argv[2])

PAGE = """<!doctype html>
<meta charset="utf-8">
<style>
  body { margin: 0; background: #f6f7f9; color: #171717; font: 18px/1.45 system-ui, sans-serif; }
  main { box-sizing: border-box; width: 1280px; height: 800px; padding: 96px 120px; }
  h1 { font-size: 34px; margin: 0 0 18px; }
  p { max-width: 720px; margin: 0 0 24px; }
  label { display: block; font-weight: 700; margin-block-end: 8px; }
  textarea {
    box-sizing: border-box;
    width: 680px;
    height: 130px;
    padding: 16px;
    border: 1px solid #9aa7a1;
    border-radius: 8px;
    background: #fff;
    color: #171717;
    font: 18px/1.45 system-ui, sans-serif;
  }
</style>
<main>
  <h1>Nahou checks text where you write</h1>
  <p>Local suggestions appear next to editable web fields. The extension talks only to the loopback local API configured in settings.</p>
  <label for="draft">Draft message</label>
  <textarea id="draft">helo wat you are do?</textarea>
</main>
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
                },
                {
                    "source": "english:phrase",
                    "original": "wat",
                    "span": {"start_utf16": 5, "end_utf16": 8},
                    "replacements": ["what"],
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
        $edgeProcess = $null
        try {
            $apiProcess = Start-Process -FilePath $python -ArgumentList @($serverPy, 'api', [string]$apiPort) -PassThru -WindowStyle Hidden
            $pageProcess = Start-Process -FilePath $python -ArgumentList @($serverPy, 'page', [string]$pagePort) -PassThru -WindowStyle Hidden
            $webClient = [Net.WebClient]::new()

            $apiReady = $false
            for ($i = 0; $i -lt 40; $i++) {
                try {
                    $null = $webClient.DownloadString("http://127.0.0.1:$apiPort/v1/health")
                    $apiReady = $true
                    break
                } catch {
                    Start-Sleep -Milliseconds 250
                }
            }

            $pageReady = $false
            for ($i = 0; $i -lt 40; $i++) {
                try {
                    $content = $webClient.DownloadString("http://127.0.0.1:$pagePort/")
                    if ($content -like '*Draft message*') {
                        $pageReady = $true
                        break
                    }
                } catch {
                    Start-Sleep -Milliseconds 250
                }
            }

            if (-not $apiReady -or -not $pageReady) {
                throw "Python QA servers not ready. apiReady=$apiReady pageReady=$pageReady"
            }

            $edgeProcess = Start-Process -FilePath $edge -ArgumentList @(
                '--headless=new',
                '--disable-gpu',
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
                    $serviceWorker = @($targets | Where-Object { $_.type -eq 'service_worker' -and $_.url -like 'chrome-extension://*/src/background.js' } | Select-Object -First 1)[0]
                    if ($serviceWorker) {
                        break
                    }
                } catch {}
                if ($edgeProcess.HasExited) {
                    throw "Edge exited early $($edgeProcess.ExitCode)"
                }
                Start-Sleep -Milliseconds 250
            }

            if (-not $serviceWorker) {
                throw ('Nahou service worker target not found. Targets=' + (($targets | Select-Object type, title, url) | ConvertTo-Json -Compress))
            }

            $extensionId = ([uri]$serviceWorker.url).Host
            $pageTarget = @($targets | Where-Object { $_.type -eq 'page' } | Select-Object -First 1)[0]
            if (-not $pageTarget) {
                throw 'No page target found.'
            }

            $socket = [Net.WebSockets.ClientWebSocket]::new()
            $socket.ConnectAsync([Uri]$pageTarget.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
            try {
                $null = Invoke-Cdp $socket 1 'Emulation.setDeviceMetricsOverride' @{
                    width = 1280
                    height = 800
                    deviceScaleFactor = 1
                    mobile = $false
                }

                $null = Invoke-Cdp $socket 2 'Page.navigate' @{ url = "chrome-extension://$extensionId/options.html" }
                Start-Sleep -Milliseconds 800
                $settingsExpression = @"
(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await wait(200);
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  document.getElementById('api-base-url').value = 'http://127.0.0.1:$apiPort';
  document.getElementById('writing-mode').value = 'english';
  document.querySelector('form').dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
  await wait(300);
  return document.getElementById('status').textContent;
})()
"@
                $settingsStatus = (Invoke-Cdp $socket 3 'Runtime.evaluate' @{
                    expression = $settingsExpression
                    awaitPromise = $true
                    returnByValue = $true
                }).result.result.value
                Save-Screenshot $socket 4 (Join-Path $screenshotsDir '01-options-settings.png')

                $null = Invoke-Cdp $socket 5 'Page.navigate' @{ url = "chrome-extension://$extensionId/popup.html" }
                Start-Sleep -Milliseconds 1000
                $popupExpression = @'
(() => {
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  document.body.style.width = '320px';
  return {
    title: document.querySelector('h1')?.textContent ?? null,
    apiStatus: document.getElementById('api-status')?.textContent ?? null,
    checking: document.getElementById('checking-status')?.textContent ?? null
  };
})()
'@
                $popupState = (Invoke-Cdp $socket 6 'Runtime.evaluate' @{
                    expression = $popupExpression
                    returnByValue = $true
                }).result.result.value
                Save-Screenshot $socket 7 (Join-Path $screenshotsDir '02-popup-status.png')

                $null = Invoke-Cdp $socket 8 'Page.navigate' @{ url = "http://127.0.0.1:$pagePort/" }
                Start-Sleep -Milliseconds 800
                $panelExpression = @'
(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const textarea = document.getElementById('draft');
  textarea.focus();
  textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '?' }));
  await wait(1800);
  return {
    title: document.querySelector('h1')?.textContent ?? null,
    panelText: document.querySelector('[data-alfaraheedi-panel]')?.textContent ?? null,
    buttonLabel: document.querySelector('[data-alfaraheedi-panel] button')?.getAttribute('aria-label') ?? null
  };
})()
'@
                $panelState = (Invoke-Cdp $socket 9 'Runtime.evaluate' @{
                    expression = $panelExpression
                    awaitPromise = $true
                    returnByValue = $true
                }).result.result.value
                Save-Screenshot $socket 10 (Join-Path $screenshotsDir '03-web-field-suggestions.png')
            } finally {
                $socket.Dispose()
            }

            $files = @(Get-ChildItem -LiteralPath $screenshotsDir -Filter '*.png' | Sort-Object Name | ForEach-Object {
                $bytes = [IO.File]::ReadAllBytes($_.FullName)
                [pscustomobject]@{
                    Name = $_.Name
                    Path = $_.FullName
                    Bytes = $bytes.Length
                    PngSignatureOk = ($bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50 -and $bytes[2] -eq 0x4e -and $bytes[3] -eq 0x47)
                    Width = [BitConverter]::ToUInt32(([byte[]]@($bytes[19], $bytes[18], $bytes[17], $bytes[16])), 0)
                    Height = [BitConverter]::ToUInt32(([byte[]]@($bytes[23], $bytes[22], $bytes[21], $bytes[20])), 0)
                }
            })

            $ok = (
                $settingsStatus -eq 'Saved.' -and
                $popupState.title -eq 'Nahou' -and
                $popupState.apiStatus -eq 'Local API reachable.' -and
                $popupState.checking -eq 'On' -and
                $panelState.panelText -like '*hello*' -and
                $panelState.buttonLabel -eq 'Apply suggestion: hello' -and
                $files.Count -eq 3 -and
                -not @($files | Where-Object { -not $_.PngSignatureOk -or $_.Width -ne 1280 -or $_.Height -ne 800 })
            )

            [pscustomobject]@{
                Ok = $ok
                QaRoot = $Root
                ExtensionId = $extensionId
                SettingsStatus = $settingsStatus
                PopupState = $popupState
                PanelState = $panelState
                ScreenshotsDir = $screenshotsDir
                Files = $files
            } | ConvertTo-Json -Depth 20
            if (-not $ok) {
                throw "Store screenshot capture failed. See JSON output above."
            }
        } finally {
            if ($edgeProcess -and -not $edgeProcess.HasExited) {
                $edgeProcess | Stop-Process -Force -ErrorAction SilentlyContinue
            }
            if ($apiProcess -and -not $apiProcess.HasExited) {
                $apiProcess | Stop-Process -Force -ErrorAction SilentlyContinue
            }
            if ($pageProcess -and -not $pageProcess.HasExited) {
                $pageProcess | Stop-Process -Force -ErrorAction SilentlyContinue
            }
            Get-Process -Name msedge -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        }
    } -ArgumentList $QaRoot

    $localRunDir = Join-Path $resolvedOutDir (Split-Path -Leaf $QaRoot)
    New-Item -ItemType Directory -Force -Path $localRunDir | Out-Null
    Copy-Item -FromSession $session -Path (Join-Path $QaRoot 'screenshots\*.png') -Destination $localRunDir -Force
    $result = $resultJson | ConvertFrom-Json
    $result | Add-Member -NotePropertyName LocalScreenshotRoot -NotePropertyValue $localRunDir -Force
    $result | ConvertTo-Json -Depth 20
} finally {
    Remove-PSSession $session
}
