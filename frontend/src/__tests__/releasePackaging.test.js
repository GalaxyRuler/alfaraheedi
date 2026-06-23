import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("desktop release packaging", () => {
  it("defaults the optional Windows developer zip to the current v0.5 release", async () => {
    const source = await fs.readFile(
      path.join(repoRoot, "scripts/package-windows.ps1"),
      "utf8",
    );

    expect(source).toMatch(/\[string\]\$Version = "0\.5\.0"/u);
    expect(source).not.toMatch(/\[string\]\$Version = "0\.4\.1"/u);
  });

  it("does not describe the old v0.4 zip as the current public package", async () => {
    const readme = await fs.readFile(path.join(repoRoot, "README.md"), "utf8");

    expect(readme).toMatch(/current recommended Windows package/u);
    expect(readme).toMatch(/Nahou-0\.5\.0-windows-x64-setup\.exe/u);
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
});
