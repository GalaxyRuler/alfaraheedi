import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const addinsRoot = path.join(repoRoot, "office-addins");

describe("Office add-ins package metadata", () => {
  it("ships an add-in-only XML manifest for Word and PowerPoint", async () => {
    const manifest = await fs.readFile(path.join(addinsRoot, "manifest.xml"), "utf8");
    const devManifest = await fs.readFile(
      path.join(addinsRoot, "manifest.dev.xml"),
      "utf8",
    );
    const prodManifest = await fs.readFile(
      path.join(addinsRoot, "manifest.prod.xml"),
      "utf8",
    );

    expect(manifest).toMatch(/xsi:type="TaskPaneApp"/u);
    expect(manifest).toMatch(/<Version>1\.0\.0<\/Version>/u);
    expect(manifest).toMatch(/<Host Name="Document"\/>/u);
    expect(manifest).toMatch(/<Host Name="Presentation"\/>/u);
    expect(manifest).not.toMatch(/<Requirements>/u);
    expect(manifest).toMatch(/<Permissions>ReadWriteDocument<\/Permissions>/u);
    expect(manifest).toMatch(
      /<SourceLocation DefaultValue="https:\/\/localhost:3443\/office-addins\/taskpane\.html"\/>/u,
    );
    expect(manifest).toMatch(/http:\/\/127\.0\.0\.1:3000/u);
    expect(manifest).toMatch(/http:\/\/localhost:3000/u);
    expect(manifest).toMatch(/browser-extension\/icons\/icon-32\.png/u);
    expect(manifest).toMatch(/browser-extension\/icons\/icon-128\.png/u);
    expect(devManifest).toContain("https://localhost:3443/office-addins/taskpane.html");
    expect(prodManifest).toContain(
      "https://galaxyruler.github.io/alfaraheedi/office-addins/taskpane.html",
    );
    expect(prodManifest).toContain(
      '<PrivacyUrl DefaultValue="https://galaxyruler.github.io/alfaraheedi/privacy.html"/>',
    );
    expect(prodManifest).not.toMatch(/localhost|127\.0\.0\.1/u);
  });

  it("keeps the task pane wired to Office.js and local API modules", async () => {
    const taskpane = await fs.readFile(path.join(addinsRoot, "taskpane.html"), "utf8");
    const taskpaneJs = await fs.readFile(
      path.join(addinsRoot, "src/taskpane.js"),
      "utf8",
    );
    const officeApi = await fs.readFile(
      path.join(addinsRoot, "src/officeApi.js"),
      "utf8",
    );
    const localApi = await fs.readFile(
      path.join(addinsRoot, "src/localApi.js"),
      "utf8",
    );

    expect(taskpane).toMatch(/appsforoffice\.microsoft\.com\/lib\/1\/hosted\/office\.js/u);
    expect(taskpane).toMatch(/src\/taskpane\.js/u);
    expect(taskpane).toMatch(/Check Selection/u);
    expect(taskpane).toMatch(/Apply Safe Fixes/u);
    expect(taskpane).toMatch(/Copy Corrected Text/u);
    expect(taskpaneJs).toMatch(/Office\.onReady/u);
    expect(taskpaneJs).toMatch(/getCurrentOfficeSelection/u);
    expect(taskpaneJs).toMatch(/replaceSelectedTextInOffice/u);
    expect(taskpaneJs).toMatch(/analyzeTextWithLocalApi/u);
    expect(taskpaneJs).toMatch(/applySafeWithLocalApi/u);
    expect(taskpaneJs).toMatch(/stale selection|Selection changed/iu);
    expect(taskpaneJs).toMatch(/Nahou local API is unavailable/u);
    expect(officeApi).toMatch(/getSelectedDataAsync/u);
    expect(officeApi).toMatch(/setSelectedDataAsync/u);
    expect(officeApi).toMatch(/Office\.CoercionType\.Text/u);
    expect(officeApi).toMatch(/STALE_SELECTION/u);
    expect(officeApi).toMatch(/UNSUPPORTED_SELECTION/u);
    expect(localApi).toMatch(/http:\/\/127\.0\.0\.1:3000/u);
    expect(localApi).toMatch(/\/v1\/analyze/u);
    expect(localApi).toMatch(/\/v1\/apply/u);
    expect(localApi).toMatch(/isLoopbackApiBaseUrl/u);
    expect(localApi).not.toMatch(/https:\/\/api\.|telemetry|analytics/u);
  });

  it("packages only the source-controlled Office add-in foundation files", async () => {
    const packageTool = await fs.readFile(
      path.join(addinsRoot, "tools/package-office-addin.mjs"),
      "utf8",
    );
    const packageScript = await fs.readFile(
      path.join(repoRoot, "scripts/package-office-addins.ps1"),
      "utf8",
    );
    const validateScript = await fs.readFile(
      path.join(repoRoot, "scripts/validate-office-addins-release.ps1"),
      "utf8",
    );
    const manualGateDoc = await fs.readFile(
      path.join(addinsRoot, "MANUAL_RELEASE_GATES.md"),
      "utf8",
    );
    const newManualQaScript = await fs.readFile(
      path.join(repoRoot, "scripts/new-office-addins-manual-qa-report.ps1"),
      "utf8",
    );
    const checkManualQaScript = await fs.readFile(
      path.join(repoRoot, "scripts/check-office-addins-manual-qa-report.ps1"),
      "utf8",
    );
    const serveScript = await fs.readFile(
      path.join(repoRoot, "scripts/serve-office-addins.ps1"),
      "utf8",
    );
    const certScript = await fs.readFile(
      path.join(repoRoot, "scripts/New-OfficeAddinDevCertificate.ps1"),
      "utf8",
    );
    const serveTool = await fs.readFile(
      path.join(addinsRoot, "tools/serve-office-addin.mjs"),
      "utf8",
    );

    for (const entry of [
      "manifest.xml",
      "README.md",
      "taskpane.html",
      "styles/taskpane.css",
      "src/localApi.js",
      "src/officeApi.js",
      "src/taskpane.js",
    ]) {
      expect(packageTool, entry).toContain(entry);
    }

    expect(packageScript).toMatch(/\$version = \[string\]\$manifestXml\.OfficeApp\.Version/u);
    expect(packageScript).toMatch(/nahou-office-addins-\$version/u);
    expect(packageScript).toMatch(/target\\office-addins-package/u);
    expect(packageScript).toMatch(/System\.Threading\.Mutex/u);
    expect(packageScript).toMatch(/StagingRootRemoved/u);
    expect(validateScript).toMatch(/officeAddinsPackage\.test\.js/u);
    expect(validateScript).toMatch(/ReadWriteDocument/u);
    expect(validateScript).toMatch(/manifest\.dev\.xml/u);
    expect(validateScript).toMatch(/manifest\.prod\.xml/u);
    expect(validateScript).toMatch(/ProductionManifest/u);
    expect(validateScript).toMatch(/PrivacyUrl/u);
    expect(validateScript).toMatch(/HostClaimsMatchDocs/u);
    expect(validateScript).toMatch(/Document/u);
    expect(validateScript).toMatch(/Presentation/u);
    expect(validateScript).toMatch(/https:\/\/localhost:/u);
    expect(validateScript).toMatch(/package-office-addins\.ps1/u);
    expect(validateScript).toMatch(/MANUAL_RELEASE_GATES\.md/u);
    expect(validateScript).toMatch(/check-office-addins-manual-qa-report\.ps1/u);
    expect(validateScript).toMatch(/new-office-addins-manual-qa-report\.ps1/u);
    expect(validateScript).toMatch(/serve-office-addin\.mjs/u);
    expect(validateScript).toMatch(/New-OfficeAddinDevCertificate\.ps1/u);
    expect(validateScript).toMatch(/serve-office-addins\.ps1/u);
    expect(serveScript).toMatch(/NAHOU_OFFICE_ADDIN_PFX_PASSWORD/u);
    expect(serveScript).toMatch(/localhost-office-addin-dev\.pfx/u);
    expect(serveScript).toMatch(/office-addins\\tools\\serve-office-addin\.mjs/u);
    expect(certScript).toMatch(/\[switch\]\$Trust/u);
    expect(certScript).toMatch(/Cert:\\CurrentUser\\Root/u);
    expect(certScript).toMatch(/Export-PfxCertificate/u);
    expect(certScript).toMatch(/if \(\$Trust\)/u);
    expect(serveTool).toMatch(/https\.createServer/u);
    expect(serveTool).toMatch(/fs\.realpath/u);
    expect(serveTool).toMatch(/isInsideRepoRoot/u);
    expect(serveTool).toMatch(/contentTypes/u);
    expect(serveTool).toMatch(/office-addins\/taskpane\.html/u);
    expect(serveTool).not.toMatch(/from "express"|from 'express'|require\("express"\)/u);
    expect(manualGateDoc).toMatch(/Gate 1: Fresh Local Preflight/u);
    expect(manualGateDoc).toMatch(/Gate 3: Word Sideload Flow/u);
    expect(manualGateDoc).toMatch(/Gate 4: PowerPoint Sideload Flow/u);
    expect(manualGateDoc).toMatch(/Decision: Sideload QA approved/u);
    expect(newManualQaScript).toMatch(/office-addins\\MANUAL_RELEASE_GATES\.md/u);
    expect(newManualQaScript).toMatch(/dist\\office-addins-manual-qa/u);
    expect(newManualQaScript).toMatch(/Gate source SHA256/u);
    expect(newManualQaScript).toMatch(/Decision: TODO Sideload QA approved/u);
    expect(checkManualQaScript).toMatch(/GateHashMatches/u);
    expect(checkManualQaScript).toMatch(/ReleaseDecision/u);
    expect(checkManualQaScript).toMatch(/Sideload QA approved/u);
  });

  it("guards Office replacement against stale or unsupported selections", async () => {
    const previousOffice = globalThis.Office;
    globalThis.Office = {
      AsyncResultStatus: {
        Succeeded: "succeeded",
        Failed: "failed",
      },
      CoercionType: {
        Text: "text",
      },
    };
    const officeApi = await import(
      "../../../office-addins/src/officeApi.js?guarded-replacement-test"
    );

    let writtenText = "";
    const freshContext = {
      document: {
        getSelectedDataAsync: (_coercionType, callback) =>
          callback({ status: "succeeded", value: "helo" }),
        setSelectedDataAsync: (text, _options, callback) => {
          writtenText = text;
          callback({ status: "succeeded", value: undefined });
        },
      },
    };
    await expect(
      officeApi.replaceSelectedTextInOffice(
        { expectedText: "helo", replacementText: "hello" },
        freshContext,
      ),
    ).resolves.toEqual({
      state: officeApi.OFFICE_SELECTION_STATES.APPLIED,
      text: "hello",
    });
    expect(writtenText).toBe("hello");

    const staleContext = {
      document: {
        getSelectedDataAsync: (_coercionType, callback) =>
          callback({ status: "succeeded", value: "changed" }),
        setSelectedDataAsync: () => {
          throw new Error("setSelectedDataAsync should not run");
        },
      },
    };
    await expect(
      officeApi.replaceSelectedTextInOffice(
        { expectedText: "helo", replacementText: "hello" },
        staleContext,
      ),
    ).resolves.toEqual({
      state: officeApi.OFFICE_SELECTION_STATES.STALE_SELECTION,
      text: "changed",
    });

    const unsupportedContext = {
      document: {
        getSelectedDataAsync: (_coercionType, callback) =>
          callback({
            status: "failed",
            error: { message: "Selection is unsupported." },
          }),
      },
    };
    await expect(
      officeApi.getCurrentOfficeSelection(unsupportedContext),
    ).resolves.toMatchObject({
      state: officeApi.OFFICE_SELECTION_STATES.UNSUPPORTED_SELECTION,
    });

    if (previousOffice === undefined) {
      delete globalThis.Office;
    } else {
      globalThis.Office = previousOffice;
    }
  });

  it("runs the Office add-ins foundation validator in CI", async () => {
    const workflow = await fs.readFile(
      path.join(repoRoot, ".github/workflows/ci.yml"),
      "utf8",
    );

    expect(workflow).toMatch(/office-addins:/u);
    expect(workflow).toMatch(/runs-on:\s+windows-latest/u);
    expect(workflow).toMatch(/actions\/setup-node@v6/u);
    expect(workflow).toMatch(/cache-dependency-path:\s+frontend\/package-lock\.json/u);
    expect(workflow).toMatch(/validate-office-addins-release\.ps1/u);
    expect(workflow).toMatch(/actions\/upload-artifact@v6/u);
    expect(workflow).toMatch(/nahou-office-addins-1\.0\.0-foundation/u);
    expect(workflow).toMatch(/dist\/office-addins\/nahou-office-addins-1\.0\.0\.zip/u);
  });

  it("documents the v0.8 boundary without claiming live Office store readiness", async () => {
    const readme = await fs.readFile(path.join(addinsRoot, "README.md"), "utf8");
    const rootReadme = await fs.readFile(path.join(repoRoot, "README.md"), "utf8");
    const releaseChecklist = await fs.readFile(
      path.join(repoRoot, "docs/release-checklist.md"),
      "utf8",
    );
    const validationSummary = await fs.readFile(
      path.join(repoRoot, "docs/testing/office-addins-v0.8-validation.md"),
      "utf8",
    );

    expect(readme).toMatch(/v0\.8 Word and PowerPoint add-in foundation/u);
    expect(readme).toMatch(/task-pane integration, not a live underline overlay/u);
    expect(readme).toMatch(/New-OfficeAddinDevCertificate\.ps1/u);
    expect(readme).toMatch(/serve-office-addins\.ps1/u);
    expect(readme).toMatch(/Do not use `-Trust`\s+unless you accept/u);
    expect(readme).toMatch(/Selected Office text is sent only to the configured loopback/u);
    expect(readme).toMatch(/No telemetry/u);
    expect(readme).toMatch(/MANUAL_RELEASE_GATES\.md/u);
    expect(readme).toMatch(/new-office-addins-manual-qa-report\.ps1/u);
    expect(readme).toMatch(/check-office-addins-manual-qa-report\.ps1/u);
    expect(readme).not.toMatch(/store-ready|Chrome Web Store|Edge Add-ons/u);
    expect(rootReadme).toMatch(/New-OfficeAddinDevCertificate\.ps1/u);
    expect(rootReadme).toMatch(/serve-office-addins\.ps1/u);
    expect(rootReadme).toMatch(/CurrentUser trusted root store/u);
    expect(releaseChecklist).toMatch(/New-OfficeAddinDevCertificate\.ps1/u);
    expect(releaseChecklist).toMatch(/serve-office-addins\.ps1/u);
    expect(releaseChecklist).toMatch(/CurrentUser certificate store change/u);
    expect(releaseChecklist).toMatch(/check-office-addins-manual-qa-report\.ps1 -RequireCompleted/u);
    expect(validationSummary).toMatch(/Office Add-ins v0\.8 Validation Summary/u);
    expect(validationSummary).toMatch(/Manual Sideload Gates/u);
    expect(validationSummary).toMatch(/Sideload QA approved/u);
    expect(validationSummary).toMatch(/AppSource readiness/u);
  });
});
