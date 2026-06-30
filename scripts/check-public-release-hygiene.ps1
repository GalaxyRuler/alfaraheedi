param(
    [switch]$RequireClean
)

$ErrorActionPreference = "Stop"

function Invoke-GitLines {
    param([Parameter(Mandatory = $true)] [string[]]$Arguments)

    $output = & git @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        $outputText = ($output | Out-String).Trim()
        throw "git $($Arguments -join ' ') failed with exit code ${LASTEXITCODE}. Output=$outputText"
    }

    return @($output | Where-Object { $_ -and $_.Trim() })
}

function Test-GitIgnored {
    param([Parameter(Mandatory = $true)] [string]$Path)

    & git check-ignore --quiet -- $Path
    return $LASTEXITCODE -eq 0
}

function Get-PublicReleaseDocPaths {
    $explicitFiles = [string[]]@(
        ".github/pull_request_template.md",
        ".github/workflows/ci.yml",
        ".github/workflows/pages.yml",
        "CHANGELOG.md",
        "CONTRIBUTING.md",
        "PRIVACY.md",
        "README.md",
        "SECURITY.md",
        "docs/release-checklist.md"
    )
    $paths = @($explicitFiles | Where-Object { Test-Path -LiteralPath $_ })

    foreach ($root in @("browser-extension", "docs/public")) {
        if (-not (Test-Path -LiteralPath $root)) {
            continue
        }

        $paths += Get-ChildItem -LiteralPath $root -Recurse -File |
            Where-Object { $_.FullName -notmatch "\\docs\\testing\\" } |
            Where-Object { $_.Extension -in @(".md", ".html", ".json", ".yml", ".yaml") } |
            ForEach-Object { Resolve-Path -LiteralPath $_.FullName -Relative }
    }

    if (Test-Path -LiteralPath "docs/testing") {
        $paths += Get-ChildItem -LiteralPath "docs/testing" -File -Filter "*.md" |
            ForEach-Object { Resolve-Path -LiteralPath $_.FullName -Relative }
    }

    return @($paths | ForEach-Object { $_.TrimStart(".", "\", "/") } | Sort-Object -Unique)
}

function Find-PublicDocLocalReference {
    param([Parameter(Mandatory = $true)] [string[]]$Paths)

    $pattern = "C:\\Users|C:\\CodexProjects|C:\\QA|C:\\CodexRunner|OneDrive|LisanStudio-QA|\.codex|\.agents|\.claude|docs[\\/]+plans|docs[\\/]+superpowers"
    $hits = @()
    foreach ($path in $Paths) {
        if (-not (Test-Path -LiteralPath $path)) {
            continue
        }

        $matches = Select-String -LiteralPath $path -Pattern $pattern -AllMatches
        foreach ($match in $matches) {
            $hits += [pscustomobject]@{
                Path = $path.Replace("\", "/")
                LineNumber = $match.LineNumber
                Text = $match.Line.Trim()
            }
        }
    }

    return $hits
}

function Find-ReportRawTextSample {
    $arabicHello = -join @(
        [char]0x0645,
        [char]0x0631,
        [char]0x062D,
        [char]0x0628,
        [char]0x0640,
        [char]0x0640,
        [char]0x0627,
        "  ",
        [char]0x0628,
        [char]0x0627,
        [char]0x0644,
        [char]0x0639,
        [char]0x0627,
        [char]0x0644,
        [char]0x0645
    )
    $arabicQuestion = -join @(
        [char]0x0643,
        [char]0x064A,
        [char]0x0641,
        " ",
        [char]0x062D,
        [char]0x0627,
        [char]0x0644,
        "  ",
        [char]0x0645,
        [char]0x0627,
        " ",
        [char]0x0627,
        [char]0x062E,
        [char]0x0628,
        [char]0x0627,
        [char]0x0631
    )
    $samplePatterns = [string[]]@(
        "hello what are you doing",
        "helo wat you are do",
        $arabicHello,
        $arabicQuestion,
        "sample private selected text",
        "raw selected text sample"
    )
    $artifactRoots = [string[]]@(
        "docs/testing/reports",
        "dist",
        "frontend/playwright-report",
        "frontend/test-results"
    )
    $trackedPaths = @()
    foreach ($root in $artifactRoots) {
        $trackedPaths += Invoke-GitLines @("ls-files", "--", $root)
    }
    $trackedPaths += Invoke-GitLines @("ls-files", "--", "*.log")
    $trackedPaths += Invoke-GitLines @("ls-files", "--", "*report*.md", "*report*.json", "*report*.html", "*report*.txt")

    $candidatePaths = @($trackedPaths |
        Where-Object { $_ -and (Test-Path -LiteralPath $_) } |
        Where-Object { $_ -match "([\\/](reports?|test-results|playwright-report)[\\/])|(^dist[\\/])|(\.log$)" } |
        Sort-Object -Unique)

    $hits = @()
    foreach ($path in $candidatePaths) {
        foreach ($pattern in $samplePatterns) {
            $matches = Select-String -LiteralPath $path -Pattern $pattern -SimpleMatch
            foreach ($match in $matches) {
                $hits += [pscustomobject]@{
                    Path = $path.Replace("\", "/")
                    LineNumber = $match.LineNumber
                    Pattern = $pattern
                    Text = $match.Line.Trim()
                }
            }
        }
    }

    return $hits
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Push-Location $repoRoot
try {
    $ignoredPathChecks = [ordered]@{
        CodexDir = Test-GitIgnored ".codex/session.json"
        AgentsDir = Test-GitIgnored ".agents/session.json"
        ClaudeDir = Test-GitIgnored ".claude/settings.local.json"
        DistReleaseHandoff = Test-GitIgnored "dist/browser-extension-release-handoff/example.md"
        DistManualQa = Test-GitIgnored "dist/browser-extension-manual-qa/example.md"
        DistStoreAssets = Test-GitIgnored "dist/browser-extension-store-assets/example.png"
        FrontendTestResults = Test-GitIgnored "frontend/test-results/example.txt"
        FrontendPlaywrightReport = Test-GitIgnored "frontend/playwright-report/index.html"
        DocsTestingReports = Test-GitIgnored "docs/testing/reports/private-vm-qa.md"
        EnvFile = Test-GitIgnored ".env"
        EnvLocalFile = Test-GitIgnored ".env.local"
        PlansDir = Test-GitIgnored "docs/plans/private.md"
        SuperpowersDir = Test-GitIgnored "docs/superpowers/plans/private.md"
    }

    $restrictedTrackedRoots = [string[]]@(
        ".agents",
        ".claude",
        ".codex",
        "dist",
        "docs/plans",
        "docs/superpowers",
        "docs/testing/reports",
        "frontend/playwright-report",
        "frontend/test-results"
    )
    $trackedRestricted = @()
    foreach ($root in $restrictedTrackedRoots) {
        $trackedRestricted += Invoke-GitLines @("ls-files", "--", $root)
    }
    $trackedEnvFiles = Invoke-GitLines @("ls-files", "--", ".env", ".env.*")
    $trackedRestricted = @($trackedRestricted + $trackedEnvFiles | Sort-Object -Unique)
    $existingTrackedRestricted = @($trackedRestricted | Where-Object { Test-Path -LiteralPath $_ } | Sort-Object -Unique)
    $deletedTrackedRestricted = @($trackedRestricted | Where-Object { -not (Test-Path -LiteralPath $_) } | Sort-Object -Unique)

    $requiredIgnoreTexts = [ordered]@{
        Dist = "/dist/"
        Agents = "/.agents/"
        Claude = "/.claude/"
        Codex = "/.codex/"
        Env = ".env"
        EnvWildcard = ".env.*"
        Plans = "/docs/plans/"
        Superpowers = "/docs/superpowers/"
        TestingReports = "/docs/testing/reports/"
    }
    $gitignoreText = Get-Content -LiteralPath ".gitignore" -Raw
    $gitignoreChecks = [ordered]@{}
    foreach ($entry in $requiredIgnoreTexts.GetEnumerator()) {
        $gitignoreChecks[$entry.Key] = $gitignoreText.Contains($entry.Value)
    }

    $ignoredPathsReady = -not @($ignoredPathChecks.GetEnumerator() | Where-Object { -not $_.Value })
    $gitignoreReady = -not @($gitignoreChecks.GetEnumerator() | Where-Object { -not $_.Value })
    $noRestrictedTrackedFiles = $existingTrackedRestricted.Count -eq 0
    $publicDocPaths = Get-PublicReleaseDocPaths
    $publicDocLocalReferences = @(Find-PublicDocLocalReference $publicDocPaths)
    $noPublicDocLocalReferences = $publicDocLocalReferences.Count -eq 0
    $reportRawTextSampleHits = @(Find-ReportRawTextSample)
    $noReportRawTextSamples = $reportRawTextSampleHits.Count -eq 0
    $publicReleaseHygieneReady = [bool]($ignoredPathsReady -and $gitignoreReady -and $noRestrictedTrackedFiles -and $noPublicDocLocalReferences -and $noReportRawTextSamples)

    $result = [pscustomobject]@{
        RepoRoot = $repoRoot
        IgnoredPathChecks = [pscustomobject]$ignoredPathChecks
        GitignoreChecks = [pscustomobject]$gitignoreChecks
        TrackedRestrictedFiles = $existingTrackedRestricted
        DeletedRestrictedFiles = $deletedTrackedRestricted
        PublicDocLocalReferences = $publicDocLocalReferences
        ReportRawTextSampleHits = $reportRawTextSampleHits
        PublicReleaseHygieneReady = $publicReleaseHygieneReady
    }

    $result | ConvertTo-Json -Depth 6

    if ($RequireClean -and -not $publicReleaseHygieneReady) {
        throw "Public release hygiene checks failed."
    }
} finally {
    Pop-Location
}
