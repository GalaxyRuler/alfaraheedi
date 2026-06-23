param(
    [Parameter(Mandatory = $true)]
    [string]$VmName,

    [Parameter(Mandatory = $true)]
    [string]$CredentialPath,

    [string]$ZipPath = "dist\browser-extension\nahou-browser-extension-0.7.0.zip",

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
    $QaRoot = New-GuestQaRoot "production-editors-smoke"
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

            $deadline = (Get-Date).AddSeconds(60)
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

        function Wait-HttpJson {
            param([Parameter(Mandatory = $true)] [string]$Url)
            $deadline = (Get-Date).AddSeconds(20)
            while ((Get-Date) -lt $deadline) {
                try {
                    return Invoke-RestMethod $Url -TimeoutSec 1
                } catch {
                    Start-Sleep -Milliseconds 250
                }
            }
            throw "Timed out waiting for $Url"
        }

        $edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
        $python = (Get-Command python -ErrorAction Stop).Source
        $extensionDir = Join-Path $Root 'extension'
        $profileDir = Join-Path $Root 'profile'
        $serverPy = Join-Path $Root 'qa_server.py'
        $requestLog = Join-Path $Root 'requests.jsonl'
        $apiPort = 3488
        $pagePort = 41088
        $cdpPort = 9288

        New-Item -ItemType Directory -Force -Path $extensionDir, $profileDir | Out-Null
        Expand-Archive -LiteralPath (Join-Path $Root 'extension.zip') -DestinationPath $extensionDir -Force

@'
import json
import sys
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

mode = sys.argv[1]
port = int(sys.argv[2])
log_path = sys.argv[3]

PAGE = """<!doctype html>
<meta charset="utf-8">
<style>
  body { margin: 32px; font: 16px/1.45 system-ui, sans-serif; }
  [contenteditable="true"] { border: 1px solid #9aa7a1; border-radius: 8px; margin: 20px 0; min-height: 96px; padding: 14px; width: 620px; }
  [contenteditable="false"] { background: #eef1f4; border-radius: 999px; padding: 1px 6px; }
</style>
<h1>Production editor smoke</h1>
<section>
  <h2>Gmail-like compose</h2>
  <div id="gmail-compose" contenteditable="true" role="textbox" aria-label="Message Body"><div><span>helo </span><span id="gmail-chip" contenteditable="false">@Ali</span><span id="gmail-tail"> wat you are do?</span></div><div class="gmail_quote" contenteditable="false">On Monday, someone wrote private quoted text.</div></div>
</section>
<section>
  <h2>WhatsApp-like compose</h2>
  <div id="whatsapp-compose" contenteditable="true" role="textbox" aria-label="Type a message" data-tab="10"><p class="selectable-text copyable-text"><span data-lexical-text="true">helo</span><br></p><p class="selectable-text copyable-text"><span id="whatsapp-tail" data-lexical-text="true">wat you are do?</span></p></div>
</section>
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
        raw = self.rfile.read(length).decode("utf-8")
        try:
            request = json.loads(raw)
        except Exception:
            request = {"text": ""}
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(request, ensure_ascii=False) + "\n")
        text = request.get("text", "")
        if "helo  wat" in text:
            span = {"start_utf16": 6, "end_utf16": 9}
        else:
            span = {"start_utf16": 5, "end_utf16": 8}
        payload = {
            "suggestions": [
                {
                    "source": "english:phrase",
                    "original": "wat",
                    "span": span,
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
            $apiProcess = Start-Process -FilePath $python -ArgumentList @($serverPy, 'api', [string]$apiPort, $requestLog) -PassThru -WindowStyle Hidden
            $pageProcess = Start-Process -FilePath $python -ArgumentList @($serverPy, 'page', [string]$pagePort, $requestLog) -PassThru -WindowStyle Hidden
            $null = Wait-HttpJson "http://127.0.0.1:$apiPort/v1/health"
            $webClient = [Net.WebClient]::new()
            $pageReady = $false
            for ($i = 0; $i -lt 40; $i++) {
                try {
                    if ($webClient.DownloadString("http://127.0.0.1:$pagePort/") -like '*Production editor smoke*') {
                        $pageReady = $true
                        break
                    }
                } catch {
                    Start-Sleep -Milliseconds 250
                }
            }
            if (-not $pageReady) {
                throw "Production editor fixture page not ready."
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
            $extensionId = ($serviceWorker.url -replace '^chrome-extension://([^/]+)/.*$', '$1')

            $targets = Invoke-RestMethod -Method Put "http://127.0.0.1:$cdpPort/json/new?chrome-extension://$extensionId/options.html"
            $socket = [System.Net.WebSockets.ClientWebSocket]::new()
            $socket.ConnectAsync([Uri]$targets.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
            try {
                $settingsExpression = @"
new Promise((resolve) => {
  chrome.storage.local.set({
    alfaraheediSettings: {
      apiBaseUrl: 'http://127.0.0.1:$apiPort',
      writingMode: 'english',
      enabled: true
    }
  }, () => {
    resolve(chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Saved.');
  });
})
"@
                $settingsStatus = (Invoke-Cdp $socket 1 'Runtime.evaluate' @{
                    expression = $settingsExpression
                    awaitPromise = $true
                    returnByValue = $true
                }).result.result.value
            } finally {
                $socket.Dispose()
            }

            $targets = Invoke-RestMethod -Method Put "http://127.0.0.1:$cdpPort/json/new?http://127.0.0.1:$pagePort/"
            $socket = [System.Net.WebSockets.ClientWebSocket]::new()
            $socket.ConnectAsync([Uri]$targets.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
            try {
                Start-Sleep -Milliseconds 1000
                $gmailStartExpression = @'
(() => {
  document.querySelectorAll('[data-alfaraheedi-panel]').forEach((node) => node.remove());
  const editor = document.getElementById('gmail-compose');
  editor.focus();
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '?' }));
  return true;
})()
'@
                $null = Invoke-Cdp $socket 2 'Runtime.evaluate' @{
                    expression = $gmailStartExpression
                    returnByValue = $true
                }
                Start-Sleep -Milliseconds 1800
                $gmailReadExpression = @'
(() => {
  const editor = document.getElementById('gmail-compose');
  const tail = document.getElementById('gmail-tail');
  const panel = document.querySelector('[data-alfaraheedi-panel]');
  const button = panel?.querySelector('button');
  if (!button) {
    return {
      error: 'Timed out waiting for Gmail panel',
      activeElement: document.activeElement?.id ?? document.activeElement?.tagName,
      panelText: panel?.textContent ?? null
    };
  }
  const panelText = panel.textContent;
  const buttonLabel = button.getAttribute('aria-label');
  button.click();
  return {
    panelText,
    buttonLabel,
    tailText: tail.textContent,
    panelAfterCount: document.querySelectorAll('[data-alfaraheedi-panel]').length,
    editorText: editor.textContent
  };
})()
'@
                $gmailSmoke = (Invoke-Cdp $socket 3 'Runtime.evaluate' @{
                    expression = $gmailReadExpression
                    returnByValue = $true
                }).result.result.value

                $whatsappStartExpression = @'
(() => {
  document.querySelectorAll('[data-alfaraheedi-panel]').forEach((node) => node.remove());
  const editor = document.getElementById('whatsapp-compose');
  editor.focus();
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '?' }));
  return true;
})()
'@
                $null = Invoke-Cdp $socket 4 'Runtime.evaluate' @{
                    expression = $whatsappStartExpression
                    returnByValue = $true
                }
                Start-Sleep -Milliseconds 1800
                $whatsappReadExpression = @'
(() => {
  const editor = document.getElementById('whatsapp-compose');
  const tail = document.getElementById('whatsapp-tail');
  const panel = document.querySelector('[data-alfaraheedi-panel]');
  const button = panel?.querySelector('button');
  if (!button) {
    return {
      error: 'Timed out waiting for WhatsApp panel',
      activeElement: document.activeElement?.id ?? document.activeElement?.tagName,
      panelText: panel?.textContent ?? null
    };
  }
  const panelText = panel.textContent;
  const buttonLabel = button.getAttribute('aria-label');
  button.click();
  return {
    panelText,
    buttonLabel,
    tailText: tail.textContent,
    panelAfterCount: document.querySelectorAll('[data-alfaraheedi-panel]').length,
    editorText: editor.textContent
  };
})()
'@
                $whatsappSmoke = (Invoke-Cdp $socket 5 'Runtime.evaluate' @{
                    expression = $whatsappReadExpression
                    returnByValue = $true
                }).result.result.value
                $smoke = [pscustomobject]@{
                    gmail = $gmailSmoke
                    whatsapp = $whatsappSmoke
                }
            } finally {
                $socket.Dispose()
            }

            $requests = @()
            if (Test-Path -LiteralPath $requestLog) {
                $requests = @(Get-Content -LiteralPath $requestLog | Where-Object { $_.Trim() } | ForEach-Object { $_ | ConvertFrom-Json })
            }
            $texts = @($requests | ForEach-Object { $_.text })
            $gmailRequest = [bool](@($texts | Where-Object { $_ -eq 'helo  wat you are do?' } | Select-Object -First 1))
            $whatsappRequest = [bool](@($texts | Where-Object { $_ -eq "helo`nwat you are do?" } | Select-Object -First 1))
            $quotedLeak = [bool](@($texts | Where-Object { $_ -like '*private quoted text*' } | Select-Object -First 1))
            $ok = (
                $settingsStatus -eq 'Saved.' -and
                $gmailRequest -and
                $whatsappRequest -and
                -not $quotedLeak -and
                $smoke.gmail.buttonLabel -eq 'Apply suggestion: what' -and
                $smoke.gmail.tailText -eq ' what you are do?' -and
                $smoke.gmail.panelAfterCount -eq 0 -and
                $smoke.whatsapp.buttonLabel -eq 'Apply suggestion: what' -and
                $smoke.whatsapp.tailText -eq 'what you are do?' -and
                $smoke.whatsapp.panelAfterCount -eq 0
            )

            [pscustomobject]@{
                Ok = $ok
                QaRoot = $Root
                ExtensionId = $extensionId
                SettingsStatus = $settingsStatus
                Requests = $texts
                GmailRequestMatched = $gmailRequest
                WhatsAppRequestMatched = $whatsappRequest
                QuotedTextLeaked = $quotedLeak
                Smoke = $smoke
            } | ConvertTo-Json -Depth 20
            if (-not $ok) {
                throw "Production editor packaged smoke failed. See JSON output above."
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
