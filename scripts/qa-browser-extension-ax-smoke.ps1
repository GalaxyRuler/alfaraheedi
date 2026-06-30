param(
    [Parameter(Mandatory = $true)]
    [string]$VmName,

    [Parameter(Mandatory = $true)]
    [string]$CredentialPath,

    [string]$ZipPath = "dist\browser-extension\nahou-browser-extension-1.0.0.1.zip",

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
    $QaRoot = New-GuestQaRoot "ax-smoke"
}

$resolvedZipPath = Resolve-RepoPath $ZipPath
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

    Invoke-Command -Session $session -ScriptBlock {
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

        function Get-AxSummary {
            param(
                [Parameter(Mandatory = $true)] [System.Net.WebSockets.ClientWebSocket] $Socket,
                [Parameter(Mandatory = $true)] [int] $Id
            )

            $tree = (Invoke-Cdp $Socket $Id 'Accessibility.getFullAXTree' @{}).result.nodes
            return @($tree | ForEach-Object {
                [pscustomobject]@{
                    Role = $_.role.value
                    Name = $_.name.value
                }
            })
        }

        function Test-AxNode {
            param(
                [Parameter(Mandatory = $true)] [array]$Summary,
                [Parameter(Mandatory = $true)] [string]$Role,
                [Parameter(Mandatory = $true)] [string]$Name
            )
            return [bool](@($Summary | Where-Object { $_.Role -eq $Role -and $_.Name.Trim() -eq $Name } | Select-Object -First 1))
        }

        $edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
        $python = (Get-Command python -ErrorAction Stop).Source
        $extensionDir = Join-Path $Root 'extension'
        $profileDir = Join-Path $Root 'profile'
        $serverPy = Join-Path $Root 'qa_server.py'
        $apiPort = 3467
        $pagePort = 41067
        $cdpPort = 9267

        New-Item -ItemType Directory -Force -Path $extensionDir, $profileDir | Out-Null
        Expand-Archive -LiteralPath (Join-Path $Root 'extension.zip') -DestinationPath $extensionDir -Force

@'
import json
import sys
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

mode = sys.argv[1]
port = int(sys.argv[2])

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
            self._send(200, '<!doctype html><meta charset="utf-8"><label for="draft">Draft</label><textarea id="draft" style="width:420px;height:120px"></textarea>', "text/html; charset=utf-8")
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
                    if ($content -like '*textarea*') {
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
                $null = Invoke-Cdp $socket 1 'Accessibility.enable' @{}
                $null = Invoke-Cdp $socket 2 'Page.navigate' @{ url = "chrome-extension://$extensionId/options.html" }
                Start-Sleep -Milliseconds 800

                $settingsExpression = @"
(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await wait(200);
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
                $optionsAx = Get-AxSummary $socket 4

                $null = Invoke-Cdp $socket 5 'Page.navigate' @{ url = "chrome-extension://$extensionId/popup.html" }
                Start-Sleep -Milliseconds 1000
                $popupAx = Get-AxSummary $socket 6

                $null = Invoke-Cdp $socket 7 'Page.navigate' @{ url = "http://127.0.0.1:$pagePort/" }
                Start-Sleep -Milliseconds 800

                $panelExpression = @'
(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const textarea = document.getElementById('draft');
  textarea.focus();
  textarea.value = 'helo wat you are do?';
  textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '?' }));
  await wait(1800);
  return {
    panelText: document.querySelector('[data-alfaraheedi-panel]')?.textContent ?? null,
    buttonLabel: document.querySelector('[data-alfaraheedi-panel] button')?.getAttribute('aria-label') ?? null
  };
})()
'@
                $panelState = (Invoke-Cdp $socket 8 'Runtime.evaluate' @{
                    expression = $panelExpression
                    awaitPromise = $true
                    returnByValue = $true
                }).result.result.value
                $panelAx = Get-AxSummary $socket 9
            } finally {
                $socket.Dispose()
            }

            $checks = [ordered]@{
                OptionsHeading = Test-AxNode $optionsAx 'heading' 'Nahou Settings'
                OptionsApiTextbox = Test-AxNode $optionsAx 'textbox' 'Local API URL'
                OptionsWritingMode = Test-AxNode $optionsAx 'combobox' 'Writing mode'
                OptionsEnabledCheckbox = Test-AxNode $optionsAx 'checkbox' 'Check editable fields'
                OptionsSaveButton = Test-AxNode $optionsAx 'button' 'Save'
                OptionsStatusText = Test-AxNode $optionsAx 'StaticText' 'Saved.'
                PopupHeading = Test-AxNode $popupAx 'heading' 'Nahou'
                PopupPauseButton = Test-AxNode $popupAx 'button' 'Pause checking'
                PopupOptionsButton = Test-AxNode $popupAx 'button' 'Open settings'
                PanelRegion = Test-AxNode $panelAx 'region' 'Nahou suggestions'
                PanelApplyButton = Test-AxNode $panelAx 'button' 'Apply suggestion: hello'
            }
            $ok = -not @($checks.GetEnumerator() | Where-Object { $_.Value -ne $true })

            [pscustomobject]@{
                Ok = $ok
                QaRoot = $Root
                ExtensionId = $extensionId
                SettingsStatus = $settingsStatus
                PanelState = $panelState
                Checks = $checks
                OptionsAx = @($optionsAx | Where-Object { $_.Name } | Select-Object -First 20)
                PopupAx = @($popupAx | Where-Object { $_.Name } | Select-Object -First 20)
                PanelAx = @($panelAx | Where-Object { $_.Name } | Select-Object -First 20)
            } | ConvertTo-Json -Depth 20
            if (-not $ok) {
                throw "Accessibility tree smoke failed. See JSON output above for failed checks."
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
} finally {
    Remove-PSSession $session
}
