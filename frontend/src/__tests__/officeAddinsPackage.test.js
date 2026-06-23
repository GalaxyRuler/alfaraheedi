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

    expect(manifest).toMatch(/xsi:type="TaskPaneApp"/u);
    expect(manifest).toMatch(/<Version>0\.8\.0<\/Version>/u);
    expect(manifest).toMatch(/<Host Name="Document"\/>/u);
    expect(manifest).toMatch(/<Host Name="Presentation"\/>/u);
    expect(manifest).toMatch(/<Set Name="OfficeApi"\/>/u);
    expect(manifest).toMatch(/<Permissions>ReadWriteDocument<\/Permissions>/u);
    expect(manifest).toMatch(
      /<SourceLocation DefaultValue="https:\/\/localhost:3443\/office-addins\/taskpane\.html"\/>/u,
    );
    expect(manifest).toMatch(/http:\/\/127\.0\.0\.1:3000/u);
    expect(manifest).toMatch(/http:\/\/localhost:3000/u);
    expect(manifest).toMatch(/browser-extension\/icons\/icon-32\.png/u);
    expect(manifest).toMatch(/browser-extension\/icons\/icon-128\.png/u);
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
    expect(taskpaneJs).toMatch(/Office\.onReady/u);
    expect(taskpaneJs).toMatch(/getSelectedTextFromOffice/u);
    expect(taskpaneJs).toMatch(/replaceSelectedTextInOffice/u);
    expect(taskpaneJs).toMatch(/analyzeTextWithLocalApi/u);
    expect(taskpaneJs).toMatch(/applySafeWithLocalApi/u);
    expect(officeApi).toMatch(/getSelectedDataAsync/u);
    expect(officeApi).toMatch(/setSelectedDataAsync/u);
    expect(officeApi).toMatch(/Office\.CoercionType\.Text/u);
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
    expect(packageScript).toMatch(/alfaraheedi-office-addins-\$version/u);
    expect(packageScript).toMatch(/target\\office-addins-package/u);
    expect(packageScript).toMatch(/System\.Threading\.Mutex/u);
    expect(packageScript).toMatch(/StagingRootRemoved/u);
    expect(validateScript).toMatch(/officeAddinsPackage\.test\.js/u);
    expect(validateScript).toMatch(/ReadWriteDocument/u);
    expect(validateScript).toMatch(/Document/u);
    expect(validateScript).toMatch(/Presentation/u);
    expect(validateScript).toMatch(/https:\/\/localhost:/u);
    expect(validateScript).toMatch(/package-office-addins\.ps1/u);
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
    expect(workflow).toMatch(/alfaraheedi-office-addins-0\.8\.0-foundation/u);
    expect(workflow).toMatch(/dist\/office-addins\/alfaraheedi-office-addins-0\.8\.0\.zip/u);
  });

  it("documents the v0.8 boundary without claiming live Office store readiness", async () => {
    const readme = await fs.readFile(path.join(addinsRoot, "README.md"), "utf8");

    expect(readme).toMatch(/v0\.8 Word and PowerPoint add-in foundation/u);
    expect(readme).toMatch(/task-pane integration, not a live underline overlay/u);
    expect(readme).toMatch(/HTTPS task-pane host is intentionally not implemented/u);
    expect(readme).toMatch(/Selected Office text is sent only to the configured loopback/u);
    expect(readme).toMatch(/No telemetry/u);
    expect(readme).not.toMatch(/store-ready|Chrome Web Store|Edge Add-ons/u);
  });
});
