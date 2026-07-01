import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("desktop release packaging", () => {
  it("documents the v1.0 product contract without overclaiming universal writing assistance", async () => {
    const readme = await fs.readFile(path.join(repoRoot, "README.md"), "utf8");
    const contract = await fs.readFile(
      path.join(repoRoot, "docs/public/v1.0-product-contract.md"),
      "utf8",
    );
    const acceptanceMatrix = await fs.readFile(
      path.join(repoRoot, "docs/testing/v1.0-acceptance-matrix.md"),
      "utf8",
    );

    expect(contract).toMatch(/Windows-first, local-first writing companion foundation/u);
    expect(contract).toMatch(/Release-Blocking v1\.0 Surface/u);
    expect(contract).toMatch(/Foundation Integrations/u);
    expect(acceptanceMatrix).toMatch(/Desktop Foundation Gates/u);
    expect(acceptanceMatrix).toMatch(/Deferred Integration Gates/u);
    expect(acceptanceMatrix).toMatch(/No, deferred store gate/u);
    expect(acceptanceMatrix).toMatch(/No, deferred sideload gate/u);
    expect(contract).toMatch(/No hosted text processing/u);
    expect(contract).toMatch(/No telemetry/u);
    expect(contract).toMatch(/No universal live underline overlay/u);
    expect(readme).not.toMatch(/works everywhere/u);
    expect(readme).not.toMatch(/complete grammar checker/u);
  });

  it("documents the V2A browser-first contract without premature product claims", async () => {
    const readme = await fs.readFile(path.join(repoRoot, "README.md"), "utf8");
    const contractPath = path.join(repoRoot, "docs/public/v2-product-contract.md");
    const acceptanceMatrixPath = path.join(
      repoRoot,
      "docs/testing/v2-acceptance-matrix.md",
    );

    await expect(fs.access(contractPath)).resolves.toBeUndefined();

    const contract = await fs.readFile(contractPath, "utf8");
    const acceptanceMatrix = await fs.readFile(acceptanceMatrixPath, "utf8");

    expect(contract).toMatch(
      /Nahou checks supported browser text fields as you type, shows local-first suggestions directly in the field, and applies accepted deterministic suggestions in place when the original text still matches\./u,
    );
    expect(readme).toMatch(/browser-first local-ready release-candidate lane/u);
    expect(readme).toMatch(/V2A browser-extension foundation/u);
    expect(readme).not.toMatch(/The v0\.7 browser-extension foundation lives in `browser-extension\/`/u);
    expect(contract).toMatch(/does not replace the v1\.0\s+desktop selected-text product contract for desktop workflows/u);
    expect(contract).toMatch(/Store\s+readiness and site-specific production-editor claims require the separate manual\s+and account-side gates/u);
    expect(contract).toMatch(/content-side settings gate/u);
    expect(contract).toMatch(/before editor text leaves the page context/u);
    expect(contract).toMatch(/background settings gate/u);

    for (const nonClaim of [
      /No full Arabic grammar checking, full grammar checking, or grammar-perfection\s+guarantee/u,
      /No universal support for every website or every rich editor/u,
      /No desktop-wide live overlay support/u,
      /No Office live underlines/u,
      /No hosted processing/u,
      /No bundled model weights or automatic LLM rewriting/u,
      /No store approval or readiness before account-side gates/u,
    ]) {
      expect(contract).toMatch(nonClaim);
    }

    for (const acceptanceRow of [
      /textarea\/input inline suggestions/u,
      /simple contenteditable suggestions/u,
      /stale apply\/suggestion handling/u,
      /sensitive-field exclusion/u,
      /paused\/site-disabled/u,
      /local API unavailable/u,
      /IME\/composition/u,
      /RTL\/mixed text/u,
      /real-site\/manual-gated/u,
      /accessibility\/keyboard review/u,
      /release\/store gates/u,
    ]) {
      expect(acceptanceMatrix).toMatch(acceptanceRow);
    }

    expect(readme).not.toMatch(/works everywhere/u);
    expect(readme).not.toMatch(/complete grammar checker/u);
    expect(readme).not.toMatch(/desktop-wide live underlines/u);
  });

  it("documents V2B desktop overlay as an evidence-only spike", async () => {
    const readme = await fs.readFile(path.join(repoRoot, "README.md"), "utf8");
    const contract = await fs.readFile(
      path.join(repoRoot, "docs/public/v2-product-contract.md"),
      "utf8",
    );
    const researchPath = path.join(
      repoRoot,
      "docs/research/v2b-desktop-overlay-spike.md",
    );
    const scriptPath = path.join(
      repoRoot,
      "scripts/qa-desktop-overlay-whiteknight.ps1",
    );
    const matrixScriptPath = path.join(
      repoRoot,
      "scripts/qa-desktop-overlay-whiteknight-target-matrix.ps1",
    );

    await expect(fs.access(researchPath)).resolves.toBeUndefined();
    await expect(fs.access(scriptPath)).resolves.toBeUndefined();
    await expect(fs.access(matrixScriptPath)).resolves.toBeUndefined();

    const research = await fs.readFile(researchPath, "utf8");
    const script = await fs.readFile(scriptPath, "utf8");
    const matrixScript = await fs.readFile(matrixScriptPath, "utf8");

    expect(contract).toMatch(/V2B is a later evidence-driven desktop overlay track/u);
    expect(research).toMatch(/probe-only/u);
    expect(research).toMatch(/support matrix/u);
    expect(research).toMatch(/WhiteKnight target-matrix run on 2026-07-01/u);
    expect(research).not.toMatch(/pending WhiteKnight run/u);
    for (const category of ["supported", "fallback", "blocked", "unsafe"]) {
      expect(research).toMatch(new RegExp(`\\b${category}\\b`, "u"));
    }
    expect(research).toMatch(/No public desktop-wide overlay claim/u);
    expect(script).toMatch(/StageOnly/u);
    expect(script).toMatch(/probe_desktop_overlay/u);
    expect(script).toMatch(/--qa-probe-desktop-overlay/u);
    expect(script).toMatch(/ObservedTargetApp/u);
    expect(script).toMatch(/ObservedFixture/u);
    expect(script).toMatch(/AllowedSupport/u);
    expect(script).toMatch(/Do not include raw text/u);
    expect(matrixScript).toMatch(/Notepad/u);
    expect(matrixScript).toMatch(/Word/u);
    expect(matrixScript).toMatch(/PowerPoint/u);
    expect(matrixScript).toMatch(/EdgeOrChrome/u);
    expect(matrixScript).toMatch(/Electron/u);
    expect(matrixScript).toMatch(/AllowedSupport/u);
    expect(matrixScript).toMatch(/No raw user text/u);
    expect(readme).not.toMatch(/desktop-wide live overlay support/u);
    expect(readme).not.toMatch(/desktop-wide live underlines/u);
  });

  it("defaults the optional Windows developer zip to the current release candidate", async () => {
    const source = await fs.readFile(
      path.join(repoRoot, "scripts/package-windows.ps1"),
      "utf8",
    );

    expect(source).toMatch(/\[string\]\$Version = "2\.0\.0-rc\.1"/u);
    expect(source).not.toMatch(/\[string\]\$Version = "0\.4\.1"/u);
  });

  it("keeps frontend package and lockfile release metadata in sync", async () => {
    const packageJson = JSON.parse(
      await fs.readFile(path.join(repoRoot, "frontend/package.json"), "utf8"),
    );
    const packageLock = JSON.parse(
      await fs.readFile(path.join(repoRoot, "frontend/package-lock.json"), "utf8"),
    );

    expect(packageJson.version).toBe("2.0.0-rc.1");
    expect(packageLock.version).toBe(packageJson.version);
    expect(packageLock.packages[""].version).toBe(packageJson.version);
  });

  it("does not describe old Windows zip packages as the current V2A package", async () => {
    const readme = await fs.readFile(path.join(repoRoot, "README.md"), "utf8");

    expect(readme).toMatch(/package-windows\.ps1 -Version 2\.0\.0-rc\.1/u);
    expect(readme).toMatch(/browser-extension upload package/u);
    expect(readme).toMatch(/nahou-browser-extension-2\.0\.0\.1\.zip/u);
    expect(readme).toMatch(/Windows desktop installer remains the recommended package for the v1 desktop selected-text path/u);
    expect(readme).not.toMatch(/current v0\.4 Windows package/u);
  });

  it("moves the NSIS installer to the canonical user-facing filename", async () => {
    const source = await fs.readFile(
      path.join(repoRoot, "scripts/Copy-DesktopInstaller.ps1"),
      "utf8",
    );
    const verifier = await fs.readFile(
      path.join(repoRoot, "scripts/check-desktop-installer-bundle.ps1"),
      "utf8",
    );
    const releaseChecklist = await fs.readFile(
      path.join(repoRoot, "docs/release-checklist.md"),
      "utf8",
    );

    expect(source).toMatch(/Nahou_\$\(\$Version\)_x64-setup\.exe/u);
    expect(source).toMatch(/Nahou-\$Version-windows-x64-setup\.exe/u);
    expect(source).toMatch(/Get-ChildItem -LiteralPath \$bundleDir -Filter "Nahou\*setup\.exe"/u);
    expect(source).toMatch(/Remove-Item -Force/u);
    expect(source).toMatch(/Move-Item -LiteralPath \$source -Destination \$destination -Force/u);
    expect(source).toMatch(/Desktop installer moved to \$destination/u);
    expect(source).not.toMatch(/Copy-Item/u);
    expect(verifier).toMatch(/target\\release\\bundle\\nsis/u);
    expect(verifier).toMatch(/Nahou-\$Version-windows-x64-setup\.exe/u);
    expect(verifier).toMatch(/Expected exactly one desktop setup installer/u);
    expect(verifier).toMatch(/Get-FileHash/u);
    expect(verifier).toMatch(/ConvertTo-Json/u);
    expect(releaseChecklist).toMatch(
      /contains only the recommended setup installer/u,
    );
    expect(releaseChecklist).toMatch(/not stale or raw Tauri/u);
    expect(releaseChecklist).toMatch(/check-desktop-installer-bundle\.ps1/u);
  });

  it("keeps Windows smoke scripts safe for legacy powershell.exe source decoding", async () => {
    const scriptPaths = [
      "scripts/smoke-cli.ps1",
      "scripts/smoke-api.ps1",
      "scripts/smoke-llm.ps1",
      "scripts/smoke-docker.ps1",
    ];

    for (const scriptPath of scriptPaths) {
      const source = await fs.readFile(path.join(repoRoot, scriptPath), "utf8");

      expect(source, scriptPath).toMatch(/\[char\]0x0645/u);
      expect(source, scriptPath).toMatch(/\[char\]0x0640/u);
      expect(source, scriptPath).not.toMatch(/[\u0600-\u06ff]/u);
    }
  });

  it("keeps Windows smoke API calls UTF-8 encoded", async () => {
    for (const scriptPath of [
      "scripts/smoke-api.ps1",
      "scripts/smoke-llm.ps1",
      "scripts/smoke-docker.ps1",
    ]) {
      const source = await fs.readFile(path.join(repoRoot, scriptPath), "utf8");

      expect(source, scriptPath).toMatch(/UTF8\.GetBytes/u);
      expect(source, scriptPath).toMatch(/application\/json; charset=utf-8/u);
    }

    for (const scriptPath of ["scripts/smoke-api.ps1", "scripts/smoke-docker.ps1"]) {
      const source = await fs.readFile(path.join(repoRoot, scriptPath), "utf8");

      expect(source, scriptPath).toMatch(/ConvertFrom-Utf8JsonResponse/u);
      expect(source, scriptPath).toMatch(/RawContentStream/u);
      expect(source, scriptPath).toMatch(/StreamReader.+UTF8/su);
      expect(source, scriptPath).toMatch(/Invoke-WebRequest/u);
    }

    const llmSmoke = await fs.readFile(
      path.join(repoRoot, "scripts/smoke-llm.ps1"),
      "utf8",
    );

    expect(llmSmoke).toMatch(/if \(\$ArgumentList\.Count -gt 0\)/u);
    expect(llmSmoke).toMatch(/\$startArgs\.ArgumentList = \$ArgumentList/u);

    const dockerSmoke = await fs.readFile(
      path.join(repoRoot, "scripts/smoke-docker.ps1"),
      "utf8",
    );

    expect(dockerSmoke).toMatch(/\$containerCreated = \$false/u);
    expect(dockerSmoke).toMatch(/docker ps -a --filter "name=\^\/\$containerName\$"/u);
    expect(dockerSmoke).toMatch(/if \(\$containerCreated\)/u);
  });

  it("runs safe Windows smoke checks in CI and PR review gates", async () => {
    const workflow = await fs.readFile(
      path.join(repoRoot, ".github/workflows/ci.yml"),
      "utf8",
    );
    const pullRequestTemplate = await fs.readFile(
      path.join(repoRoot, ".github/pull_request_template.md"),
      "utf8",
    );
    const releaseChecklist = await fs.readFile(
      path.join(repoRoot, "docs/release-checklist.md"),
      "utf8",
    );

    expect(workflow).toMatch(/windows-smoke:/u);
    expect(workflow).toMatch(/runs-on:\s+windows-latest/u);
    expect(workflow).toMatch(/dtolnay\/rust-toolchain@stable/u);
    expect(workflow).toMatch(/actions\/setup-node@v6/u);
    expect(workflow).toMatch(/npm ci/u);
    expect(workflow).toMatch(/\.\\scripts\\smoke-cli\.ps1/u);
    expect(workflow).toMatch(/\.\\scripts\\smoke-api\.ps1/u);
    expect(workflow).toMatch(/cargo run -p write-cli -- llm doctor/u);
    expect(workflow).toMatch(/\.\\scripts\\smoke-llm\.ps1 -MockRuntime/u);
    expect(workflow).not.toMatch(/\.\\scripts\\smoke-docker\.ps1/u);

    for (const source of [pullRequestTemplate, releaseChecklist]) {
      expect(source).toMatch(/Windows smoke CI/u);
      expect(source).toMatch(/smoke-cli\.ps1/u);
      expect(source).toMatch(/smoke-api\.ps1/u);
      expect(source).toMatch(/llm doctor/u);
      expect(source).toMatch(/smoke-llm\.ps1 -MockRuntime/u);
    }
  });

  it("builds and uploads the canonical Windows desktop installer in CI", async () => {
    const workflow = await fs.readFile(
      path.join(repoRoot, ".github/workflows/ci.yml"),
      "utf8",
    );
    const pullRequestTemplate = await fs.readFile(
      path.join(repoRoot, ".github/pull_request_template.md"),
      "utf8",
    );
    const releaseChecklist = await fs.readFile(
      path.join(repoRoot, "docs/release-checklist.md"),
      "utf8",
    );

    expect(workflow).toMatch(/desktop-windows:/u);
    expect(workflow).toMatch(/runs-on:\s+windows-latest/u);
    expect(workflow).toMatch(/dtolnay\/rust-toolchain@stable/u);
    expect(workflow).toMatch(/actions\/setup-node@v6/u);
    expect(workflow).toMatch(/npm ci/u);
    expect(workflow).toMatch(/npm run desktop:build/u);
    expect(workflow).toMatch(/check-desktop-installer-bundle\.ps1/u);
    expect(workflow).toMatch(/actions\/upload-artifact@v6/u);
    expect(workflow).toMatch(/nahou-desktop-windows-setup/u);
    expect(workflow).toMatch(
      /target\/release\/bundle\/nsis\/Nahou-\*-windows-x64-setup\.exe/u,
    );
    expect(workflow).toMatch(/if-no-files-found:\s+error/u);

    for (const source of [pullRequestTemplate, releaseChecklist]) {
      expect(source).toMatch(/Desktop Windows CI/u);
      expect(source).toMatch(/canonical setup installer/u);
    }
  });

  it("defines the v1.0 release version sync dry run contract", async () => {
    const source = await fs.readFile(
      path.join(repoRoot, "scripts/Set-ReleaseVersion.ps1"),
      "utf8",
    );

    expect(source).toMatch(/\[switch\]\$DryRun/u);
    expect(source).toMatch(/ConvertTo-StoreVersion/u);
    expect(source).toMatch(/StoreManifestVersion/u);
    expect(source).toMatch(/Cargo\.toml/u);
    expect(source).toMatch(/frontend\/package\.json/u);
    expect(source).toMatch(/src-tauri\/tauri\.conf\.json/u);
    expect(source).toMatch(/browser-extension\/manifest\.json/u);
    expect(source).toMatch(/office-addins\/manifest\.xml/u);
    expect(source).toMatch(/scripts\/package-windows\.ps1/u);
    expect(source).toMatch(/capture-browser-extension-store-screenshots\.ps1/u);
    expect(source).toMatch(/qa-browser-extension-production-editors-smoke\.ps1/u);
    expect(source).toMatch(/ConvertTo-Json -Depth 4/u);
  });

  it("builds release artifacts with signing, checksums, and license reporting", async () => {
    const workflow = await fs.readFile(
      path.join(repoRoot, ".github/workflows/release.yml"),
      "utf8",
    );
    const signingDoc = await fs.readFile(
      path.join(repoRoot, "docs/release-signing.md"),
      "utf8",
    );

    expect(workflow).toMatch(/Set-ReleaseVersion\.ps1 -Version/u);
    expect(workflow).toMatch(/npm run desktop:build/u);
    expect(workflow).toMatch(/WINDOWS_SIGNING_PFX_BASE64/u);
    expect(workflow).toMatch(/signtool\.exe/u);
    expect(workflow).toMatch(/check-desktop-installer-bundle\.ps1 -Version/u);
    expect(workflow).toMatch(/package-windows\.ps1 .* -SkipFrontendInstall/u);
    expect(workflow).toMatch(/package-browser-extension\.ps1/u);
    expect(workflow).toMatch(/package-office-addins\.ps1/u);
    expect(workflow).toMatch(/license-report\.json/u);
    expect(workflow).toMatch(/checksums\.sha256/u);
    expect(workflow).toMatch(/target\/release\/bundle\/nsis\/Nahou-\*-windows-x64-setup\.exe/u);
    expect(workflow).toMatch(/dist\/browser-extension\/\*\.zip/u);
    expect(workflow).toMatch(/dist\/office-addins\/\*\.zip/u);

    expect(signingDoc).toMatch(/WINDOWS_SIGNING_PFX_BASE64/u);
    expect(signingDoc).toMatch(/Unsigned builds are acceptable for local QA/u);
    expect(signingDoc).toMatch(
      /Tauri updater is deferred to v1\.1 because updater signing and update endpoint operations need a stable release channel/u,
    );
    expect(signingDoc).toMatch(/WebView2 Evergreen Runtime/u);
    expect(signingDoc).toMatch(/SmartScreen approval unless/u);
  });

  it("documents v0.9 UI Automation as a bounded capture-only desktop pilot", async () => {
    const readme = await fs.readFile(path.join(repoRoot, "README.md"), "utf8");
    const architecture = await fs.readFile(
      path.join(repoRoot, "docs/architecture.md"),
      "utf8",
    );
    const validation = await fs.readFile(
      path.join(repoRoot, "docs/testing/uia-v0.9-validation.md"),
      "utf8",
    );
    const releaseChecklist = await fs.readFile(
      path.join(repoRoot, "docs/release-checklist.md"),
      "utf8",
    );
    const cargoToml = await fs.readFile(
      path.join(repoRoot, "src-tauri/Cargo.toml"),
      "utf8",
    );
    const desktopLib = await fs.readFile(
      path.join(repoRoot, "src-tauri/src/lib.rs"),
      "utf8",
    );
    const uiaPilot = await fs.readFile(
      path.join(repoRoot, "src-tauri/src/uia_pilot.rs"),
      "utf8",
    );

    for (const source of [readme, architecture, validation]) {
      expect(source).toMatch(/UI Automation/u);
      expect(source).toMatch(/capture/u);
      expect(source).toMatch(/clipboard paste fallback/u);
    }

    expect(readme).toMatch(/not a live underline overlay/u);
    expect(architecture).toMatch(/No always-on UIA polling/u);
    expect(releaseChecklist).toMatch(/Windows UI Automation capture/u);
    expect(releaseChecklist).toMatch(/replacement still uses clipboard paste fallback/u);
    expect(cargoToml).toMatch(/Win32_UI_Accessibility/u);
    expect(cargoToml).toMatch(/Win32_System_Com/u);
    expect(desktopLib).toMatch(/CaptureMethod::WindowsUiaTextPattern/u);
    expect(desktopLib).toMatch(/CaptureMethod::ClipboardShortcut/u);
    expect(desktopLib).toMatch(/get_uia_pilot_status/u);
    expect(uiaPilot).toMatch(/UiaNodeFromHandle/u);
    expect(uiaPilot).toMatch(/TextPattern_GetSelection/u);
    expect(uiaPilot).toMatch(/TextRange_GetText/u);
    expect(uiaPilot).toMatch(/replacement_supported: false/u);
  });
});
