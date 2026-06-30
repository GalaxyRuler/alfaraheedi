import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  listBrowserExtensionPackageEntries,
  validateBrowserExtensionManifest,
} from "../../../browser-extension/tools/package-extension.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const extensionRoot = path.join(repoRoot, "browser-extension");
const runtimeHelperScripts = [
  "src/editorDiscovery.js",
  "src/textProjection.js",
  "src/suggestionAnchors.js",
  "src/applySuggestion.js",
  "src/overlayLayer.js",
  "src/suggestionCard.js",
];
const runtimeContentScripts = [...runtimeHelperScripts, "src/content.js"];

function getSelectedStoreScreenshotRoot(storeAssetsSource) {
  const screenshotRootMatches = [
    ...storeAssetsSource.matchAll(
      /^dist\\browser-extension-store-assets\\v0\.7-extension-store-screenshots-\d{8}-\d{6}$/gmu,
    ),
  ];

  if (screenshotRootMatches.length === 0) {
    throw new Error("STORE_ASSETS.md does not declare a selected screenshot root.");
  }

  return screenshotRootMatches[screenshotRootMatches.length - 1][0];
}

function luminanceChannel(channel) {
  const normalized = channel / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function hexToRgb(hexColor) {
  const match = /^#(?<red>[0-9a-f]{2})(?<green>[0-9a-f]{2})(?<blue>[0-9a-f]{2})$/iu.exec(
    hexColor,
  );

  if (!match?.groups) {
    throw new Error(`Expected a 6-digit hex color, got ${hexColor}.`);
  }

  return [
    Number.parseInt(match.groups.red, 16),
    Number.parseInt(match.groups.green, 16),
    Number.parseInt(match.groups.blue, 16),
  ];
}

function contrastRatio(foreground, background) {
  const foregroundRgb = hexToRgb(foreground);
  const backgroundRgb = hexToRgb(background);
  const foregroundLuminance =
    0.2126 * luminanceChannel(foregroundRgb[0]) +
    0.7152 * luminanceChannel(foregroundRgb[1]) +
    0.0722 * luminanceChannel(foregroundRgb[2]);
  const backgroundLuminance =
    0.2126 * luminanceChannel(backgroundRgb[0]) +
    0.7152 * luminanceChannel(backgroundRgb[1]) +
    0.0722 * luminanceChannel(backgroundRgb[2]);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

describe("browser extension package metadata", () => {
  const safeManifest = {
    manifest_version: 3,
    name: "Nahou Writing Companion",
    short_name: "Nahou",
    version: "0.7.0",
    description: "Local-first writing suggestions for editable web fields.",
    icons: {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png",
    },
    action: {
      default_title: "Nahou",
      default_icon: {
        "16": "icons/icon-16.png",
        "32": "icons/icon-32.png",
      },
      default_popup: "popup.html",
    },
    permissions: ["storage"],
    host_permissions: [
      "http://127.0.0.1/*",
      "http://localhost/*",
    ],
    options_page: "options.html",
    background: {
      service_worker: "src/background.js",
      type: "module",
    },
    content_scripts: [
      {
        matches: ["http://*/*", "https://*/*"],
        js: ["src/content.js"],
        css: ["src/content.css"],
        run_at: "document_idle",
        all_frames: true,
      },
    ],
  };

  it("declares storage-backed options for local API settings", async () => {
    const manifest = validateBrowserExtensionManifest(
      JSON.parse(
        await fs.readFile(path.join(extensionRoot, "manifest.json"), "utf8"),
      ),
    );

    expect(manifest.permissions).toEqual(["storage"]);
    expect(manifest.options_page).toBe("options.html");
  });

  it("declares PNG extension icons for install and extension-management surfaces", async () => {
    const manifest = validateBrowserExtensionManifest(
      JSON.parse(
        await fs.readFile(path.join(extensionRoot, "manifest.json"), "utf8"),
      ),
    );

    expect(manifest.icons).toEqual({
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png",
    });
  });

  it("declares a toolbar action for quick settings and status access", async () => {
    const manifest = validateBrowserExtensionManifest(
      JSON.parse(
        await fs.readFile(path.join(extensionRoot, "manifest.json"), "utf8"),
      ),
    );

    expect(manifest.action).toEqual({
      default_title: "Nahou",
      default_icon: {
        "16": "icons/icon-16.png",
        "32": "icons/icon-32.png",
      },
      default_popup: "popup.html",
    });
  });

  it("ships valid PNG icon assets at the manifest-declared sizes", async () => {
    const manifest = validateBrowserExtensionManifest(
      JSON.parse(
        await fs.readFile(path.join(extensionRoot, "manifest.json"), "utf8"),
      ),
    );

    for (const [size, iconPath] of Object.entries(manifest.icons)) {
      const icon = await fs.readFile(path.join(extensionRoot, iconPath));

      expect([...icon.subarray(0, 8)]).toEqual([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      expect(icon.readUInt32BE(16)).toBe(Number(size));
      expect(icon.readUInt32BE(20)).toBe(Number(size));
    }
  });

  it("injects the content script into frames for iframe-hosted editors", async () => {
    const manifest = validateBrowserExtensionManifest(
      JSON.parse(
        await fs.readFile(path.join(extensionRoot, "manifest.json"), "utf8"),
      ),
    );

    expect(manifest.content_scripts).toHaveLength(1);
    expect(manifest.content_scripts[0]).toEqual(
      expect.objectContaining({
        all_frames: true,
      }),
    );
  });

  it("loads shared runtime helpers before the packaged content orchestrator", async () => {
    const manifest = validateBrowserExtensionManifest(
      JSON.parse(
        await fs.readFile(path.join(extensionRoot, "manifest.json"), "utf8"),
      ),
    );
    const entries = await listBrowserExtensionPackageEntries(extensionRoot);

    expect(manifest.content_scripts).toHaveLength(1);
    expect(manifest.content_scripts[0].js).toEqual(runtimeContentScripts);
    expect(entries).toEqual(expect.arrayContaining(runtimeContentScripts));
  });

  it("keeps the MV3 manifest scoped to local API access and editable web fields", () => {
    const manifest = validateBrowserExtensionManifest(safeManifest);

    expect(manifest.version).toBe("0.7.0");
  });

  it("keeps manifest listing fields inside Chrome and Edge store constraints", async () => {
    const manifest = validateBrowserExtensionManifest(
      JSON.parse(
        await fs.readFile(path.join(extensionRoot, "manifest.json"), "utf8"),
      ),
    );

    expect(manifest.name.length).toBeLessThanOrEqual(75);
    expect(manifest.short_name).toBe("Nahou");
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.description.length).toBeLessThanOrEqual(132);
  });

  it("rejects broad privileges, remote hosts, and package expansion hooks", () => {
    expect(() =>
      validateBrowserExtensionManifest({
        ...safeManifest,
        name: "A".repeat(76),
        short_name: "too-long-short-name",
        description: "D".repeat(133),
        permissions: ["storage", "tabs"],
        host_permissions: ["https://api.example.test/*"],
        optional_permissions: ["scripting"],
        optional_host_permissions: ["https://*/*"],
        externally_connectable: { matches: ["https://example.test/*"] },
        web_accessible_resources: [
          {
            resources: ["src/content.js"],
            matches: ["https://*/*"],
          },
        ],
      }),
    ).toThrow(
      [
        "name must be 75 characters or fewer.",
        "short_name is required and must be 12 characters or fewer.",
        "description must be 132 characters or fewer.",
        "permissions must contain only storage for extension settings.",
        "host_permissions must be loopback API URLs only.",
        "optional_permissions are not allowed in the v0.7 extension package.",
        "optional_host_permissions are not allowed in the v0.7 extension package.",
        "externally_connectable is not allowed in the v0.7 extension package.",
        "web_accessible_resources are not allowed in the v0.7 extension package.",
      ].join("\n"),
    );
  });

  it("requires content scripts to stay on web pages, document_idle, and all frames", () => {
    expect(() =>
      validateBrowserExtensionManifest({
        ...safeManifest,
        content_scripts: [
          {
            matches: ["<all_urls>", "http://*/*", "https://*/*"],
            js: ["src/content.js"],
            css: ["src/content.css"],
            run_at: "document_start",
            all_frames: false,
          },
        ],
      }),
    ).toThrow(
      [
        "content_scripts[0].matches must contain only http and https pages.",
        "content_scripts[0].run_at must be document_idle.",
        "content_scripts[0].all_frames must be true for iframe editors.",
      ].join("\n"),
    );
  });

  it("packages only runtime extension files and required static imports", async () => {
    const entries = await listBrowserExtensionPackageEntries(extensionRoot);

    expect(entries).toEqual([
      "icons/icon-128.png",
      "icons/icon-16.png",
      "icons/icon-32.png",
      "icons/icon-48.png",
      "manifest.json",
      "options.html",
      "popup.html",
      "PRIVACY_POLICY.md",
      "src/applySuggestion.js",
      "src/background.js",
      "src/content.css",
      "src/content.js",
      "src/editorDiscovery.js",
      "src/localApi.js",
      "src/options.js",
      "src/overlayLayer.js",
      "src/popup.js",
      "src/settings.js",
      "src/suggestionAnchors.js",
      "src/suggestionCard.js",
      "src/textProjection.js",
    ]);
    expect(entries).not.toContain("src/editorSurface.js");
  });

  it("keeps packaged runtime files free of text logging and telemetry primitives", async () => {
    const entries = await listBrowserExtensionPackageEntries(extensionRoot);
    const runtimeSourceEntries = entries.filter((entry) =>
      /\.(?:html|js|css|json)$/u.test(entry),
    );

    for (const entry of runtimeSourceEntries) {
      const source = await fs.readFile(path.join(extensionRoot, entry), "utf8");

      expect(source, entry).not.toMatch(
        /console\.|navigator\.sendBeacon|XMLHttpRequest|\b(?:analytics|telemetry|sentry|mixpanel)\b/iu,
      );
    }
  });

  it("keeps packaged runtime files free of remote-code execution primitives", async () => {
    const entries = await listBrowserExtensionPackageEntries(extensionRoot);
    const runtimeSourceEntries = entries.filter((entry) =>
      /\.(?:html|js|css|json)$/u.test(entry),
    );

    for (const entry of runtimeSourceEntries) {
      const source = await fs.readFile(path.join(extensionRoot, entry), "utf8");

      expect(source, entry).not.toMatch(
        /eval\s*\(|new\s+Function\s*\(|importScripts\s*\(|<script\b[^>]*\bsrc=["']https?:|import\s*\(\s*["']https?:/iu,
      );
    }
  });

  it("documents store privacy fields and permission justifications before submission", async () => {
    const source = await fs.readFile(
      path.join(extensionRoot, "STORE_SUBMISSION.md"),
      "utf8",
    );

    expect(source).toMatch(/single purpose/iu);
    expect(source).toMatch(/storage/iu);
    expect(source).toMatch(/host_permissions/iu);
    expect(source).toMatch(/remote code/iu);
    expect(source).toMatch(/No telemetry/iu);
    expect(source).toMatch(/local API/iu);
    expect(source).toMatch(/browser-extension\/PRIVACY_POLICY\.md/u);
  });

  it("ships a browser-extension privacy policy matching store disclosures", async () => {
    const source = await fs.readFile(
      path.join(extensionRoot, "PRIVACY_POLICY.md"),
      "utf8",
    );

    expect(source).toMatch(/active editable-field text/iu);
    expect(source).toMatch(/local loopback Nahou API/iu);
    expect(source).toMatch(/does not send text to Nahou-hosted services/iu);
    expect(source).toMatch(/stores only extension settings/iu);
    expect(source).toMatch(/local API URL/iu);
    expect(source).toMatch(/writing mode/iu);
    expect(source).toMatch(/enabled or paused state/iu);
    expect(source).toMatch(/content script checks the enabled and disabled-site settings before\s+sending\s+active-field text to the extension runtime/iu);
    expect(source).toMatch(/service worker\s+repeats the same\s+settings gate before\s+calling\s+the local API/iu);
    expect(source).toMatch(/health and status checks do not include editor text/iu);
    expect(source).toMatch(/Content-script messages cannot\s+override the stored API URL\s+or\s+writing mode/u);
    expect(source).toMatch(/does not store captured editor text/iu);
    expect(source).toMatch(/does not use telemetry/iu);
    expect(source).toMatch(/does not load or execute remote code/iu);
    expect(source).toMatch(/password fields/iu);
    expect(source).toMatch(/sensitive-looking fields/iu);
    expect(source).toMatch(/Non-loopback API URLs are rejected/u);
    expect(source).toMatch(/does not sell browser extension data/iu);
    expect(source).toMatch(/No Nahou operator or reviewer receives or reads user editor text/iu);
  });

  it("keeps reviewer-ready store submission notes current and bounded", async () => {
    const source = await fs.readFile(
      path.join(extensionRoot, "STORE_SUBMISSION.md"),
      "utf8",
    );

    expect(source).toContain(
      "https://developer.chrome.com/docs/webstore/program-policies/policies",
    );
    expect(source).toContain(
      "https://developer.chrome.com/docs/webstore/cws-dashboard-privacy",
    );
    expect(source).toContain(
      "https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies",
    );
    expect(source).toContain(
      "https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension",
    );
    expect(source).toMatch(/Chrome single-purpose field/iu);
    expect(source).toMatch(/Chrome permission field text/iu);
    expect(source).toMatch(/V2A browser-first local-ready build/iu);
    expect(source).not.toMatch(/This v0\.7 foundation/u);
    expect(source).toMatch(/No, I am not using remote code\./u);
    expect(source).toMatch(/rejects blank, malformed, and oversized analysis messages/iu);
    expect(source).toMatch(/Visibility:\s+keep `Hidden`/iu);
    expect(source).toMatch(/Category:\s+`Productivity`/u);
    expect(source).toMatch(/Reviewer notes/iu);
    expect(source).toMatch(/Submission hold points/iu);
    expect(source).toMatch(/Do not claim live Gmail, WhatsApp Web, Google Docs/iu);
    expect(source).toMatch(/STORE_ASSETS\.md/u);
    expect(source).toMatch(/export-browser-extension-store-submission\.ps1/u);
    expect(source).toMatch(/check-browser-extension-public-privacy-url\.ps1/u);
    expect(source).toMatch(/check-browser-extension-pages-readiness\.ps1/u);
    expect(source).toMatch(/get-browser-extension-release-readiness\.ps1/u);
    expect(source).toMatch(/MANUAL_RELEASE_GATES\.md/u);
    expect(source).toMatch(/new-browser-extension-manual-qa-report\.ps1/u);
    expect(source).toMatch(/live production-editor/iu);
    expect(source).toMatch(/manual screen-reader/iu);
  });

  it("keeps browser extension store asset selection explicit and claims-bounded", async () => {
    const source = await fs.readFile(
      path.join(extensionRoot, "STORE_ASSETS.md"),
      "utf8",
    );
    const selectedScreenshotRoot = getSelectedStoreScreenshotRoot(source);

    for (const file of [
      "01-options-settings.png",
      "02-popup-status.png",
      "03-web-field-suggestions.png",
    ]) {
      expect(source).toContain(file);
    }

    expect(source).toMatch(/1280x800/u);
    expect(source).toMatch(/alt text/iu);
    expect(source).toMatch(/Do not imply live Gmail, WhatsApp Web, Google Docs/iu);
    expect(source).toMatch(/Do not show private user text/iu);
    expect(source).toMatch(/PRIVACY_POLICY\.md/u);
    expect(source).toMatch(/STORE_SUBMISSION\.md/u);
    expect(source).toMatch(/MANUAL_RELEASE_GATES\.md/u);
    expect(selectedScreenshotRoot).toMatch(
      /^dist\\browser-extension-store-assets\\v0\.7-extension-store-screenshots-\d{8}-\d{6}$/u,
    );
    expect(source).not.toMatch(/C:\\\\CodexProjects/u);
  });

  it("keeps manual release gates explicit before public store submission", async () => {
    const gateSource = await fs.readFile(
      path.join(extensionRoot, "MANUAL_RELEASE_GATES.md"),
      "utf8",
    );
    const reportScript = await fs.readFile(
      path.join(repoRoot, "scripts/new-browser-extension-manual-qa-report.ps1"),
      "utf8",
    );
    const reportCheckScript = await fs.readFile(
      path.join(repoRoot, "scripts/check-browser-extension-manual-qa-report.ps1"),
      "utf8",
    );

    for (const requiredText of [
      "Fresh Automated Release Preflight",
      "Public Privacy URL",
      "Live Production Editors",
      "Manual Screen-Reader And Keyboard Review",
      "Store Dashboard Review",
      "Gmail compose",
      "WhatsApp Web composer",
      "Google Docs",
      "Windows Narrator",
      "Do not include private emails, chats, document text, account names",
      "Store listing copy implies unsupported production editors",
      "ManualQaReportCompleted",
      "Decision: Public release approved",
      "no TODO",
      "V2A browser-first build",
    ]) {
      expect(gateSource).toContain(requiredText);
    }
    expect(gateSource).not.toMatch(/extension v0\.7/u);

    expect(reportScript).toMatch(/browser-extension\\MANUAL_RELEASE_GATES\.md/u);
    expect(reportScript).toMatch(/dist\\browser-extension-manual-qa/u);
    expect(reportScript).toMatch(/\[string\]\$Version = ""/u);
    expect(reportScript).toMatch(/browser-extension\\manifest\.json/u);
    expect(reportScript).toMatch(/Get-Content -LiteralPath \$manifestPath -Raw \| ConvertFrom-Json/u);
    expect(reportScript).toMatch(/\[pscustomobject\]@\{\s*Version\s*=\s*\$Version\s*Report/su);
    expect(reportScript).toMatch(/Gate source SHA256/u);
    expect(reportScript).toMatch(/GateSourceSha256/u);
    expect(reportScript).toMatch(/Get-FileHash/u);
    expect(reportScript).toMatch(/Assert-PathUnderRepo/u);
    expect(reportScript).toMatch(/helo wat you are do\?/u);
    expect(reportScript).toMatch(/Do not include private emails, chats, document text/u);
    expect(reportScript).toMatch(/Controlled Fixture Coverage/u);
    expect(reportScript).toMatch(/WhiteKnight Evidence/u);
    expect(reportScript).toMatch(/Public-safe artifact check: TODO Pass \/ Fail/u);
    expect(reportCheckScript).toMatch(/ManualQaRoot/u);
    expect(reportCheckScript).toMatch(/RequireCompleted/u);
    expect(reportCheckScript).toMatch(/GateHashMatches/u);
    expect(reportCheckScript).toMatch(/HasTodo/u);
    expect(reportCheckScript).toMatch(/ReleaseDecision/u);
    expect(reportCheckScript).toMatch(/PublicSafeConfirmed/u);
    expect(reportCheckScript).toMatch(/RequiredV2CoveragePresent/u);
    expect(reportCheckScript).toMatch(/Completed/u);
    expect(reportCheckScript).toMatch(/Public release approved/u);
    expect(reportCheckScript).toMatch(/TODO/u);
    expect(reportCheckScript).toMatch(/\\bTODO\\b/u);
    expect(reportCheckScript).not.toMatch(/\b(?:POST|PATCH|PUT|DELETE|Remove-Item|Copy-Item|Set-Content|New-Item)\b/u);
    expect(gateSource).toMatch(/get-browser-extension-release-readiness\.ps1/u);
  });

  it("keeps V2 browser-extension security docs aligned with implemented privacy gates", async () => {
    const threatModel = await fs.readFile(
      path.join(repoRoot, "docs/security/v2-browser-extension-threat-model.md"),
      "utf8",
    );
    const privacyReview = await fs.readFile(
      path.join(repoRoot, "docs/security/v2-browser-extension-privacy-review.md"),
      "utf8",
    );
    const combinedSource = `${threatModel}\n${privacyReview}`;

    expect(combinedSource).toMatch(/content-side settings gate/iu);
    expect(combinedSource).toMatch(/before editor text leaves the page context/iu);
    expect(combinedSource).toMatch(/background repeats the same pause and site-disable gate/iu);
    expect(combinedSource).toMatch(/health checks and settings checks contain no editor text/iu);
    expect(combinedSource).toMatch(/local loopback Nahou API/iu);
    expect(combinedSource).toMatch(/no hosted fallback/iu);
    expect(combinedSource).toMatch(/no telemetry/iu);
    expect(combinedSource).toMatch(/no raw text retention/iu);
  });

  it("keeps the release preflight script wired to package and VM gates", async () => {
    const source = await fs.readFile(
      path.join(repoRoot, "scripts/validate-browser-extension-release.ps1"),
      "utf8",
    );
    const screenshotCaptureSource = await fs.readFile(
      path.join(repoRoot, "scripts/capture-browser-extension-store-screenshots.ps1"),
      "utf8",
    );

    expect(source).toMatch(/browserExtension\.test\.js/u);
    expect(source).toMatch(/browserExtensionSettings\.test\.js/u);
    expect(source).toMatch(/browserExtensionPackage\.test\.js/u);
    expect(source).toMatch(/ExtensionRuntimeTests/u);
    expect(source).toMatch(/export-browser-extension-release-handoff\.ps1/u);
    expect(source).toMatch(/check-browser-extension-manual-qa-report\.ps1/u);
    expect(source).toMatch(/prepare-browser-extension-release-candidate\.ps1/u);
    expect(source).toMatch(/package-browser-extension\.ps1/u);
    expect(source).toMatch(/PRIVACY_POLICY\.md/u);
    expect(source).toMatch(/\$expectedEntries\s*=\s*\[string\[\]\]/u);
    expect(source).toMatch(/FullName\s+-replace\s+'\\\\',\s+'\/'/u);
    expect(source).toMatch(/\$manifest\s*=\s*Get-Content -LiteralPath \$manifestPath -Raw \| ConvertFrom-Json/u);
    expect(source).toMatch(/\$results\.Version\s*=\s*\$manifest\.version/u);
    expect(source).toMatch(/qa-browser-extension-ax-smoke\.ps1/u);
    expect(source).toMatch(/qa-browser-extension-production-editors-smoke\.ps1/u);
    expect(source).toMatch(/capture-browser-extension-store-screenshots\.ps1/u);
    expect(source).toMatch(/qa-browser-extension-keyboard-flow-smoke\.ps1/u);
    expect(screenshotCaptureSource).toMatch(/LocalScreenshotRoot/u);
    expect(source).toMatch(/ChromeForTesting/u);
    expect(source).toMatch(/ZipEntries/u);
    expect(source).toMatch(/Assert-PowerShellScriptSyntax/u);
    expect(source).toMatch(/System\.Management\.Automation\.Language\.Parser/u);
    expect(source).toMatch(/PowerShellReleaseScriptSyntax/u);
    expect(source).toMatch(/check-public-release-hygiene\.ps1/u);
    expect(source).toMatch(/PublicReleaseHygiene/u);
    expect(source).toMatch(/Invoke-CheckedJson/u);
    expect(source).toMatch(/ConvertFrom-CommandJson/u);
    expect(source).toMatch(/EdgeAccessibilityTreeSmoke\s*=\s*Invoke-CheckedJson/u);
    expect(source).toMatch(/EdgeStoreScreenshots\s*=\s*Invoke-CheckedJson/u);
    expect(source).toMatch(/Edge Accessibility Tree smoke/u);
    expect(source).toMatch(/Chrome for Testing keyboard-flow smoke/u);
    expect(source).toMatch(/Assert-StoreAssetManifest/u);
    expect(source).toMatch(/STORE_ASSETS\.md/u);
    expect(source).toMatch(/Assert-PublicPrivacyPage/u);
    expect(source).toMatch(/docs\\public\\browser-extension\\privacy\.html/u);
    expect(source).toMatch(/Assert-ManualReleaseGates/u);
    expect(source).toMatch(/ManualReleaseGates/u);
    expect(source).toMatch(/check-browser-extension-store-submission-integrity\.ps1/u);
  });

  it("keeps Phase 9 browser QA scripts mapped to the V2A controlled coverage matrix", async () => {
    const productionSmoke = await fs.readFile(
      path.join(repoRoot, "scripts/qa-browser-extension-production-editors-smoke.ps1"),
      "utf8",
    );
    const keyboardSmoke = await fs.readFile(
      path.join(repoRoot, "scripts/qa-browser-extension-keyboard-flow-smoke.ps1"),
      "utf8",
    );
    const axSmoke = await fs.readFile(
      path.join(repoRoot, "scripts/qa-browser-extension-ax-smoke.ps1"),
      "utf8",
    );

    for (const requiredSurface of [
      "textarea",
      "text-input",
      "simple-contenteditable",
      "shadow-dom",
      "iframe",
      "repeated-text",
      "rtl-mixed",
      "large-text-refusal",
      "sensitive-field",
      "api-unavailable",
      "paused-site-disabled",
    ]) {
      expect(productionSmoke).toContain(requiredSurface);
    }

    expect(productionSmoke).toMatch(/ControlledFixtureCoverage/u);
    expect(productionSmoke).toMatch(/NoRawPrivateText/u);
    expect(keyboardSmoke).toMatch(/KeyboardOnlyCardFlow/u);
    expect(keyboardSmoke).toMatch(/PanelKeyboardAppliesSuggestion/u);
    expect(axSmoke).toMatch(/AccessibilityScanCoverage/u);
    expect(axSmoke).toMatch(/PanelRegion/u);
  });

  it("keeps the extension package script compatible with absolute and repo-relative paths", async () => {
    const source = await fs.readFile(
      path.join(repoRoot, "scripts/package-browser-extension.ps1"),
      "utf8",
    );

    expect(source).toMatch(/function Resolve-RepoPath/u);
    expect(source).toMatch(/\[IO\.Path\]::IsPathRooted\(\$Path\)/u);
    expect(source).toMatch(/Resolve-RepoPath \$ExtensionRoot/u);
    expect(source).toMatch(/Resolve-RepoPath \$OutDir/u);
    expect(source).toMatch(/\$entries\s*=\s*\[string\[\]\]/u);
    expect(source).toMatch(/\$runId\s*=\s*\[System\.Guid\]::NewGuid\(\)\.ToString\("N"\)/u);
    expect(source).toMatch(/\$PackageName\.\$runId/u);
    expect(source).toMatch(/\$tempZipPath/u);
    expect(source).toMatch(/\[System\.Threading\.Mutex\]::new/u);
    expect(source).toMatch(/WaitOne\(\[TimeSpan\]::FromMinutes\(2\)\)/u);
    expect(source).toMatch(/ReleaseMutex/u);
    expect(source).toMatch(/\[System\.IO\.File\]::Replace/u);
    expect(source).toMatch(/StagingRootRemoved/u);
    expect(source).toMatch(/Remove-Item -LiteralPath \$stageRoot -Recurse -Force/u);
    expect(source).not.toMatch(/Remove-Item -LiteralPath \$zipPath/u);
    expect(source).not.toMatch(/Join-Path \$repoRoot \$ExtensionRoot/u);
    expect(source).not.toMatch(/Join-Path \$repoRoot \$OutDir/u);
  });

  it("keeps the live public privacy URL checker explicit and non-destructive by default", async () => {
    const source = await fs.readFile(
      path.join(repoRoot, "scripts/check-browser-extension-public-privacy-url.ps1"),
      "utf8",
    );

    expect(source).toMatch(
      /https:\/\/galaxyruler\.github\.io\/alfaraheedi\/browser-extension\/privacy\.html/u,
    );
    expect(source).toMatch(/Invoke-WebRequest/u);
    expect(source).toMatch(/ReadyForStorePrivacyUrl/u);
    expect(source).toMatch(/RequireLive/u);
    expect(source).toMatch(/does not send text to Nahou-hosted services/u);
    expect(source).toMatch(/No Nahou operator or reviewer receives or reads user editor text/u);
  });

  it("keeps the GitHub Pages readiness checker read-only and explicit", async () => {
    const source = await fs.readFile(
      path.join(repoRoot, "scripts/check-browser-extension-pages-readiness.ps1"),
      "utf8",
    );

    expect(source).toMatch(/GalaxyRuler\/alfaraheedi/u);
    expect(source).toMatch(/repos\/\$Repository\/pages/u);
    expect(source).toMatch(/contents\/\.github\/workflows\/pages\.yml\?ref=\$Branch/u);
    expect(source).toMatch(/check-browser-extension-public-privacy-url\.ps1/u);
    expect(source).toMatch(/ReadyForStoreSubmission/u);
    expect(source).toMatch(/RequireReady/u);
    expect(source).toMatch(/Convert-GhError/u);
    expect(source).toMatch(/PSNativeCommandUseErrorActionPreference/u);
    expect(source).toMatch(/ErrorActionPreference\s*=\s*"Continue"/u);
    expect(source).toMatch(/GetTempFileName/u);
    expect(source).not.toMatch(/\b(?:POST|PATCH|PUT|DELETE)\b/u);
  });

  it("keeps the store submission export script wired to the release bundle materials", async () => {
    const source = await fs.readFile(
      path.join(repoRoot, "scripts/export-browser-extension-store-submission.ps1"),
      "utf8",
    );

    expect(source).toMatch(/validate-browser-extension-release\.ps1/u);
    expect(source).toMatch(/package-browser-extension\.ps1/u);
    expect(source).toMatch(/STORE_SUBMISSION\.md/u);
    expect(source).toMatch(/STORE_ASSETS\.md/u);
    expect(source).toMatch(/MANUAL_RELEASE_GATES\.md/u);
    expect(source).toMatch(/browser-extension-v0\.7-validation\.md/u);
    expect(source).toMatch(/PRIVACY_POLICY\.md/u);
    expect(source).toMatch(/privacy\.html/u);
    expect(source).toMatch(/manifest\.json/u);
    expect(source).toMatch(/01-upload-package/u);
    expect(source).toMatch(/02-reviewer-docs/u);
    expect(source).toMatch(/03-screenshots/u);
    expect(source).toMatch(/01-options-settings\.png/u);
    expect(source).toMatch(/02-popup-status\.png/u);
    expect(source).toMatch(/03-web-field-suggestions\.png/u);
    expect(source).toMatch(/RELEASE_MANIFEST\.json/u);
    expect(source).toMatch(/New-ReleaseManifestFileRecord/u);
    expect(source).toMatch(/Get-FileHash/u);
    expect(source).toMatch(/Sha256/u);
    expect(source).toMatch(/GeneratedAtUtc/u);
    expect(source).toMatch(/PrivacyPolicyStillNeedsPublicUrl/u);
    expect(source).toMatch(/Version\s*=\s*\$manifest\.version/u);
    expect(source).toMatch(/\[pscustomobject\]@\{\s*Version\s*=\s*\$manifest\.version\s*SubmissionRoot/su);
    expect(source).toMatch(/Resolve-RepoPath \$pathMatches/u);
    expect(source).toMatch(/Do not claim live Gmail, WhatsApp Web, Google Docs/u);
    expect(source).toMatch(/new-browser-extension-manual-qa-report\.ps1/u);
    expect(source).toMatch(/check-browser-extension-store-submission-integrity\.ps1/u);
    expect(source).toMatch(/IntegrityReady/u);
  });

  it("keeps the store submission integrity checker tied to the selected screenshot root", async () => {
    const source = await fs.readFile(
      path.join(repoRoot, "scripts/check-browser-extension-store-submission-integrity.ps1"),
      "utf8",
    );

    expect(source).toMatch(/STORE_ASSETS\.md/u);
    expect(source).toMatch(/Get-SelectedScreenshotRoot/u);
    expect(source).toMatch(/SelectedScreenshotRoot/u);
    expect(source).toMatch(/StoreBundleScreenshotRoot/u);
    expect(source).toMatch(/ScreenshotRootsMatch/u);
    expect(source).toMatch(/ScreenshotRoot/u);
    expect(source).toMatch(/v0\\.7-extension-store-screenshots-\\d\{8\}-\\d\{6\}/u);
    expect(source).toMatch(/\$integrityReady = \[bool\]\(/u);
    expect(source).toMatch(/\$screenshotRootsMatch/u);
  });

  it("keeps the release readiness summary read-only and explicit about external blockers", async () => {
    const source = await fs.readFile(
      path.join(repoRoot, "scripts/get-browser-extension-release-readiness.ps1"),
      "utf8",
    );

    expect(source).toMatch(/check-browser-extension-pages-readiness\.ps1/u);
    expect(source).toMatch(/ReadyForStoreSubmission/u);
    expect(source).toMatch(/LocalReady/u);
    expect(source).toMatch(/StoreReady/u);
    expect(source).toMatch(/ExternalBlockers/u);
    expect(source).toMatch(/Test-SameFileHash/u);
    expect(source).toMatch(/Get-FileHash/u);
    expect(source).toMatch(/StoreUploadPackageMatchesPackage/u);
    expect(source).toMatch(/Test-ReleaseManifestPackageHash/u);
    expect(source).toMatch(/Test-ReleaseManifestFileRecords/u);
    expect(source).toMatch(/Get-RelativeBundlePath/u);
    expect(source).toMatch(/StoreReleaseManifest/u);
    expect(source).toMatch(/ReleaseManifestPackageHash/u);
    expect(source).toMatch(/ReleaseManifestReviewerDocs/u);
    expect(source).toMatch(/ReleaseManifestScreenshots/u);
    expect(source).toMatch(/Resolve-RepoPath \$pathMatches/u);
    expect(source).toMatch(/check-browser-extension-store-submission-integrity\.ps1/u);
    expect(source).toMatch(/check-browser-extension-manual-qa-report\.ps1/u);
    expect(source).toMatch(/StoreSubmissionIntegrity/u);
    expect(source).toMatch(/ReleaseManifest/u);
    expect(source).toMatch(/MANUAL_RELEASE_GATES\.md/u);
    expect(source).toMatch(/browser-extension-v0\.7-validation\.md/u);
    expect(source).toMatch(/PRIVACY_POLICY\.md/u);
    expect(source).toMatch(/03-web-field-suggestions\.png/u);
    expect(source).toMatch(/ManualQaReportTemplate/u);
    expect(source).toMatch(/ManualQaReportGateHashMatches/u);
    expect(source).toMatch(/ManualQaReportCompleted/u);
    expect(source).toMatch(/ManualQaReleaseDecision/u);
    expect(source).toMatch(/RequireLocalReady/u);
    expect(source).toMatch(/RequireStoreReady/u);
    expect(source).toMatch(/Live Gmail, WhatsApp Web, Google Docs/u);
    expect(source).toMatch(/Manual screen-reader review/u);
    expect(source).toMatch(/Chrome Web Store and Edge Add-ons/u);
    expect(source).toMatch(/External blockers:/u);
    expect(source).toMatch(/\$externalBlockers -join "`n- "/u);
    expect(source).toMatch(
      /\$storeReady = \[bool\]\(\$localReady -and \$pagesReadiness\.ReadyForStoreSubmission -and \$externalBlockers\.Count -eq 0\)/u,
    );
    expect(source).not.toMatch(/\b(?:POST|PATCH|PUT|DELETE|Remove-Item|Copy-Item|Set-Content|New-Item)\b/u);
  });

  it("keeps the release-candidate preparation wrapper wired to local gates", async () => {
    const source = await fs.readFile(
      path.join(repoRoot, "scripts/prepare-browser-extension-release-candidate.ps1"),
      "utf8",
    );

    expect(source).toMatch(/validate-browser-extension-release\.ps1/u);
    expect(source).toMatch(/export-browser-extension-store-submission\.ps1/u);
    expect(source).toMatch(/check-browser-extension-store-submission-integrity\.ps1/u);
    expect(source).toMatch(/get-browser-extension-release-readiness\.ps1/u);
    expect(source).toMatch(/-RequireLocalReady/u);
    expect(source).toMatch(/RequireStoreReady/u);
    expect(source).toMatch(/StoreSubmissionRoot/u);
    expect(source).toMatch(/ExternalBlockers/u);
    expect(source).toMatch(/VmSmokesRequested/u);
    expect(source).toMatch(/ConvertFrom-CommandJson/u);
    expect(source).toMatch(/ConvertTo-PowerShellSingleQuotedLiteral/u);
    expect(source).toMatch(/Set-Location -LiteralPath \$repoRootLiteral/u);
    expect(source).toMatch(/-Command \$command/u);
    expect(source).toMatch(/GeneratedAtUtc/u);
    expect(source).toMatch(/SelectedScreenshotRoot/u);
    expect(source).toMatch(/StoreBundleScreenshotRoot/u);
    expect(source).toMatch(/ScreenshotRootsMatch/u);
  });

  it("keeps packaged VM smoke roots configurable instead of machine-specific", async () => {
    const vmSmokeScripts = [
      "scripts/qa-browser-extension-ax-smoke.ps1",
      "scripts/qa-browser-extension-production-editors-smoke.ps1",
      "scripts/qa-browser-extension-keyboard-flow-smoke.ps1",
      "scripts/capture-browser-extension-store-screenshots.ps1",
    ];

    for (const scriptPath of vmSmokeScripts) {
      const source = await fs.readFile(path.join(repoRoot, scriptPath), "utf8");

      expect(source, scriptPath).toMatch(/ALFARAHEEDI_VM_QA_ROOT/u);
      expect(source, scriptPath).toMatch(/function New-GuestQaRoot/u);
      expect(source, scriptPath).not.toMatch(/C:\\\\QA/u);
      expect(source, scriptPath).not.toMatch(/C:\\\\CodexProjects/u);
      expect(source, scriptPath).not.toMatch(/C:\\\\Users/u);
    }
  });

  it("buffers fragmented CDP WebSocket messages in packaged VM smokes", async () => {
    const cdpSmokeScripts = [
      "scripts/qa-browser-extension-ax-smoke.ps1",
      "scripts/qa-browser-extension-keyboard-flow-smoke.ps1",
      "scripts/capture-browser-extension-store-screenshots.ps1",
    ];

    for (const scriptPath of cdpSmokeScripts) {
      const source = await fs.readFile(path.join(repoRoot, scriptPath), "utf8");

      expect(source, scriptPath).toMatch(/\[IO\.MemoryStream\]::new\(\)/u);
      expect(source, scriptPath).toMatch(/EndOfMessage/u);
      expect(source, scriptPath).toMatch(/ConvertFrom-Json/u);
    }
  });

  it("keeps packaged keyboard smoke aligned with extension settings tab order", async () => {
    const source = await fs.readFile(
      path.join(repoRoot, "scripts/qa-browser-extension-keyboard-flow-smoke.ps1"),
      "utf8",
    );

    expect(source).toMatch(/OptionsApiFirst/u);
    expect(source).toMatch(/OptionsWritingModeSecond/u);
    expect(source).toMatch(/OptionsEnabledThird/u);
    expect(source).toMatch(/OptionsDisabledHostsFourth/u);
    expect(source).toMatch(/OptionsSaveFifth/u);
  });

  it("documents configurable VM smoke artifact roots without naming local QA machines", async () => {
    const docs = {
      "browser-extension/README.md": await fs.readFile(
        path.join(repoRoot, "browser-extension/README.md"),
        "utf8",
      ),
      "browser-extension/STORE_SUBMISSION.md": await fs.readFile(
        path.join(repoRoot, "browser-extension/STORE_SUBMISSION.md"),
        "utf8",
      ),
      "browser-extension/STORE_ASSETS.md": await fs.readFile(
        path.join(repoRoot, "browser-extension/STORE_ASSETS.md"),
        "utf8",
      ),
      "docs/release-checklist.md": await fs.readFile(
        path.join(repoRoot, "docs/release-checklist.md"),
        "utf8",
      ),
    };

    for (const [docPath, source] of Object.entries(docs)) {
      expect(source, docPath).toMatch(/ALFARAHEEDI_VM_QA_ROOT/u);
      expect(source, docPath).toMatch(/-QaRoot <guest-path>/u);
      expect(source, docPath).toMatch(/C:\\Temp\\Nahou/u);
      expect(source, docPath).not.toMatch(/LisanStudio-QA/u);
      expect(source, docPath).not.toMatch(/C:\\QA/u);
      expect(source, docPath).not.toMatch(/C:\\CodexProjects/u);
      expect(source, docPath).not.toMatch(/C:\\Users/u);
    }
  });

  it("keeps the release handoff exporter privacy-bounded and wired to readiness", async () => {
    const source = await fs.readFile(
      path.join(repoRoot, "scripts/export-browser-extension-release-handoff.ps1"),
      "utf8",
    );

    expect(source).toMatch(/prepare-browser-extension-release-candidate\.ps1/u);
    expect(source).toMatch(/Assert-PathUnderRepo/u);
    expect(source).toMatch(/dist\\browser-extension-release-handoff/u);
    expect(source).toMatch(/Release Handoff/u);
    expect(source).toMatch(/LocalChecks/u);
    expect(source).toMatch(/ExternalBlockers/u);
    expect(source).toMatch(/\[switch\]\$SkipPackageTests/u);
    expect(source).toMatch(/\$candidateArgs \+= "-SkipPackageTests"/u);
    expect(source).toMatch(/ConvertTo-PowerShellSingleQuotedLiteral/u);
    expect(source).toMatch(/Set-Location -LiteralPath \$repoRootLiteral/u);
    expect(source).toMatch(/-Command \$candidateCommand/u);
    expect(source).toMatch(/SelectedScreenshotRoot/u);
    expect(source).toMatch(/Store bundle screenshot root/u);
    expect(source).toMatch(/Store bundle screenshots match selected root/u);
    expect(source).toMatch(/StoreBundleScreenshotRoot/u);
    expect(source).toMatch(/ScreenshotRootsMatch/u);
    expect(source).toMatch(/Manual QA completed/u);
    expect(source).toMatch(/Manual QA release decision/u);
    expect(source).toMatch(/ManualQaReportCompleted/u);
    expect(source).toMatch(/ManualQaReleaseDecision/u);
    expect(source).toMatch(/VM screenshot capture roots are evidence candidates/u);
    expect(source).toMatch(/LocalScreenshotRoot/u);
    expect(source).toMatch(/Reviewer Docs/u);
    expect(source).toMatch(/02-reviewer-docs\/STORE_SUBMISSION\.md/u);
    expect(source).toMatch(/02-reviewer-docs\/browser-extension-v0\.7-validation\.md/u);
    expect(source).toMatch(/02-reviewer-docs\/PRIVACY_POLICY\.md/u);
    expect(source).not.toMatch(/`0/u);
    expect(source).toMatch(/VM Evidence Roots/u);
    expect(source).toMatch(/Do not add private account text/u);
    expect(source).toMatch(/GitHub Pages workflow deploy from main/u);
    expect(source).toMatch(/check-browser-extension-pages-readiness\.ps1 -RequireReady/u);
    expect(source).not.toMatch(/Configure GitHub Pages/u);
    expect(source).not.toMatch(/CredentialPath.+Set-Content/u);
  });

  it("keeps public release hygiene checks active for generated and internal artifacts", async () => {
    const source = await fs.readFile(
      path.join(repoRoot, "scripts/check-public-release-hygiene.ps1"),
      "utf8",
    );
    const gitignore = await fs.readFile(path.join(repoRoot, ".gitignore"), "utf8");

    expect(source).toMatch(/PublicReleaseHygieneReady/u);
    expect(source).toMatch(/git check-ignore/u);
    expect(source).toMatch(/gitignoreChecks/u);
    expect(source).toMatch(/TrackedRestrictedFiles/u);
    expect(source).toMatch(/DeletedRestrictedFiles/u);
    expect(source).toMatch(/PublicDocLocalReferences/u);
    expect(source).toMatch(/Find-PublicDocLocalReference/u);
    expect(source).toMatch(/C:\\\\CodexProjects/u);
    expect(source).toMatch(/LisanStudio-QA/u);
    expect(source).toMatch(/existingTrackedRestricted/u);
    expect(source).toMatch(/dist\/browser-extension-release-handoff\/example\.md/u);
    expect(source).toMatch(/dist\/browser-extension-manual-qa\/example\.md/u);
    expect(source).toMatch(/dist\/browser-extension-store-assets\/example\.png/u);
    expect(source).toMatch(/docs\/testing\/reports\/private-vm-qa\.md/u);
    expect(source).toMatch(/docs\/superpowers\/plans\/private\.md/u);
    expect(source).toMatch(/RequireClean/u);
    expect(gitignore).toMatch(/\/dist\//u);
    expect(gitignore).toMatch(/\/docs\/testing\/reports\//u);
    expect(gitignore).toMatch(/\/\.agents\//u);
    expect(gitignore).toMatch(/\/\.claude\//u);
    expect(gitignore).toMatch(/\/\.codex\//u);
    expect(gitignore).toMatch(/\/docs\/superpowers\//u);
    expect(gitignore).toMatch(/\.env\.\*/u);
  });

  it("keeps Pages readiness error parsing null-safe when gh stderr is empty", async () => {
    const source = await fs.readFile(
      path.join(repoRoot, "scripts/check-browser-extension-pages-readiness.ps1"),
      "utf8",
    );

    expect(source).toMatch(/rawErrorOutput = Get-Content/u);
    expect(source).toMatch(/\$null -eq \$rawErrorOutput/u);
    expect(source).toMatch(/rawErrorOutput\.Trim\(\)/u);
  });

  it("keeps the public browser extension privacy page aligned with store disclosures", async () => {
    const source = await fs.readFile(
      path.join(repoRoot, "docs/public/browser-extension/privacy.html"),
      "utf8",
    );

    expect(source).toMatch(/Nahou Browser Extension Privacy Policy/u);
    expect(source).toMatch(/Last updated: 2026-06-25/u);
    expect(source).toMatch(/local loopback Nahou API/u);
    expect(source).toMatch(/best-effort sensitive-field exclusion/u);
    expect(source).toMatch(/does not send text to Nahou-hosted services/u);
    expect(source).toMatch(/content script checks the enabled and disabled-site settings before\s+sending\s+active-field text to the extension runtime/iu);
    expect(source).toMatch(/service worker\s+repeats the same\s+settings gate before\s+calling\s+the local API/iu);
    expect(source).toMatch(/health and status checks do not include editor text/iu);
    expect(source).toMatch(/does not store captured editor text/u);
    expect(source).toMatch(/Content-script messages cannot\s+override the stored API URL\s+or\s+writing mode/u);
    expect(source).toMatch(/does not use telemetry/u);
    expect(source).toMatch(/does not load or execute remote code/u);
    expect(source).toMatch(/No Nahou operator or reviewer receives or reads user editor text/u);
  });

  it("keeps GitHub Pages publishing wired for the public privacy URL path", async () => {
    const source = await fs.readFile(
      path.join(repoRoot, ".github/workflows/pages.yml"),
      "utf8",
    );

    expect(source).toMatch(/actions\/checkout@v5/u);
    expect(source).toMatch(/actions\/configure-pages@v5/u);
    expect(source).toMatch(/actions\/upload-pages-artifact@v4/u);
    expect(source).toMatch(/actions\/deploy-pages@v4/u);
    expect(source).toMatch(/pages:\s+write/u);
    expect(source).toMatch(/id-token:\s+write/u);
    expect(source).toMatch(/Verify browser extension privacy page/u);
    expect(source).toMatch(/test -f docs\/public\/browser-extension\/privacy\.html/u);
    expect(source).toMatch(/path:\s+docs\/public/u);
    expect(source).toMatch(/github-pages/u);
  });

  it("runs browser extension release preflight in CI without VM or live-store gates", async () => {
    const source = await fs.readFile(
      path.join(repoRoot, ".github/workflows/ci.yml"),
      "utf8",
    );

    expect(source).toMatch(/browser-extension:/u);
    expect(source).toMatch(/runs-on:\s+windows-latest/u);
    expect(source).toMatch(/actions\/setup-node@v6/u);
    expect(source).toMatch(/cache-dependency-path:\s+frontend\/package-lock\.json/u);
    expect(source).toMatch(/npm ci/u);
    expect(source).toMatch(/validate-browser-extension-release\.ps1/u);
    expect(source).toMatch(/export-browser-extension-store-submission\.ps1 -SkipPreflight/u);
    expect(source).toMatch(/-AllowMissingScreenshots/u);
    expect(source).toMatch(/v0\.7-extension-store-screenshots-20260623-030207/u);
    expect(source).toMatch(/check-browser-extension-store-submission-integrity\.ps1/u);
    expect(source).not.toMatch(/Check browser extension store submission integrity[\s\S]*-RequireValid/u);
    expect(source).toMatch(/actions\/upload-artifact@v6/u);
    expect(source).toMatch(/nahou-browser-extension-1\.0\.0\.1-release-artifacts/u);
    expect(source).toMatch(/dist\/browser-extension\/nahou-browser-extension-1\.0\.0\.1\.zip/u);
    expect(source).toMatch(/dist\/browser-extension-store-submission\/nahou-browser-extension-1\.0\.0\.1-store-submission\/\*\*/u);
    expect(source).toMatch(/if-no-files-found:\s+error/u);
    expect(source).not.toMatch(/check-browser-extension-pages-readiness\.ps1\s+-RequireReady/u);
    expect(source).not.toMatch(/RunVmSmokes/u);
  });

  it("keeps CI screenshot tolerance out of the local store-validity gate", async () => {
    const exportSource = await fs.readFile(
      path.join(repoRoot, "scripts/export-browser-extension-store-submission.ps1"),
      "utf8",
    );
    const releaseCandidateSource = await fs.readFile(
      path.join(repoRoot, "scripts/prepare-browser-extension-release-candidate.ps1"),
      "utf8",
    );

    expect(exportSource).toMatch(/StoreSubmissionRoot = \$submissionRoot/u);
    expect(exportSource).toMatch(/if \(-not \$AllowMissingScreenshots\)/u);
    expect(exportSource).toMatch(/\$integrityArgs\.RequireValid = \$true/u);
    expect(releaseCandidateSource).toMatch(
      /check-browser-extension-store-submission-integrity\.ps1[\s\S]*-RequireValid/u,
    );
  });

  it("keeps pull request review gates explicit for browser-extension changes", async () => {
    const source = await fs.readFile(
      path.join(repoRoot, ".github/pull_request_template.md"),
      "utf8",
    );

    expect(source).toMatch(/Browser Extension Release Check/u);
    expect(source).toMatch(/validate-browser-extension-release\.ps1/u);
    expect(source).toMatch(/get-browser-extension-release-readiness\.ps1 -RequireLocalReady/u);
    expect(source).toMatch(/StoreSubmissionIntegrity/u);
    expect(source).toMatch(/ManualQaReportGateHashMatches/u);
    expect(source).toMatch(/validate-browser-extension-release\.ps1 -RunVmSmokes/u);
    expect(source).toMatch(/check-browser-extension-pages-readiness\.ps1/u);
    expect(source).toMatch(/Manifest permissions remain limited to `storage`/u);
    expect(source).toMatch(/telemetry, raw text logging, hosted API calls/u);
    expect(source).toMatch(/Live production-editor QA, manual screen-reader review/u);
  });

  it("keeps the release checklist wired to browser-extension store gates", async () => {
    const source = await fs.readFile(
      path.join(repoRoot, "docs/release-checklist.md"),
      "utf8",
    );

    expect(source).toMatch(/validate-browser-extension-release\.ps1/u);
    expect(source).toMatch(/validate-browser-extension-release\.ps1 -RunVmSmokes/u);
    expect(source).toMatch(/export-browser-extension-store-submission\.ps1/u);
    expect(source).toMatch(/prepare-browser-extension-release-candidate\.ps1/u);
    expect(source).toMatch(/ScreenshotRootsMatch/u);
    expect(source).toMatch(/export-browser-extension-release-handoff\.ps1/u);
    expect(source).toMatch(/check-public-release-hygiene\.ps1/u);
    expect(source).toMatch(/check-browser-extension-store-submission-integrity\.ps1 -RequireValid/u);
    expect(source).toMatch(/get-browser-extension-release-readiness\.ps1 -RequireLocalReady/u);
    expect(source).toMatch(/check-browser-extension-manual-qa-report\.ps1/u);
    expect(source).toMatch(/StoreSubmissionIntegrity/u);
    expect(source).toMatch(/ManualQaReportGateHashMatches/u);
    expect(source).toMatch(/ManualQaReportCompleted/u);
    expect(source).toMatch(/ManualQaReleaseDecision/u);
    expect(source).toMatch(/check-browser-extension-pages-readiness\.ps1 -RequireReady/u);
    expect(source).toMatch(/nahou-browser-extension-1\.0\.0\.1-release-artifacts/u);
    expect(source).not.toMatch(/nahou-browser-extension-0\.7\.0-release-artifacts/u);
    expect(source).toMatch(/browser-extension\/MANUAL_RELEASE_GATES\.md/u);
    expect(source).toMatch(/docs\/testing\/browser-extension-v0\.7-validation\.md/u);
    expect(source).toMatch(/docs\/testing\/browser-extension-v2-validation\.md/u);
    expect(source).toMatch(/live production-editor QA, manual screen-reader review/u);
  });

  it("ships a public-safe browser extension validation summary", async () => {
    const storeAssetsSource = await fs.readFile(
      path.join(extensionRoot, "STORE_ASSETS.md"),
      "utf8",
    );
    const selectedScreenshotRoot = getSelectedStoreScreenshotRoot(storeAssetsSource);
    const source = await fs.readFile(
      path.join(repoRoot, "docs/testing/browser-extension-v0.7-validation.md"),
      "utf8",
    );

    expect(source).toMatch(/Browser Extension v0\.7 Validation Summary/u);
    expect(source).toMatch(/V2A browser-first local-ready build/u);
    expect(source).toMatch(/validate-browser-extension-release\.ps1/u);
    expect(source).toMatch(/prepare-browser-extension-release-candidate\.ps1/u);
    expect(source).toMatch(/check-public-release-hygiene\.ps1 -RequireClean/u);
    expect(source).toMatch(/docs\/testing\/reports\//u);
    expect(source).toMatch(/ALFARAHEEDI_VM_QA_ROOT/u);
    expect(source).toMatch(/Current Evidence/u);
    expect(source).toMatch(/As of 2026-06-30/u);
    expect(source).toMatch(/158 browser-extension runtime, settings, and package tests/u);
    expect(source).toMatch(/Packaged Edge Accessibility Tree smoke/u);
    expect(source).toMatch(/packaged Chrome for Testing keyboard-flow smoke/u);
    expect(source).toMatch(/VM smokes are not refreshed by the 2026-06-30 Phase 8 documentation pass/u);
    expect(source).toMatch(/150\.0\.7871\.24/u);
    expect(source).toMatch(/LocalScreenshotRoot/u);
    expect(source).toContain(selectedScreenshotRoot);
    expect(source).toMatch(/store-bundle screenshot root/u);
    expect(source).toMatch(/ScreenshotRootsMatch/u);
    expect(source).toMatch(/check-browser-extension-store-submission-integrity\.ps1 -RequireValid/u);
    expect(source).toMatch(/GitHub Pages is configured/u);
    expect(source).toMatch(/workflow mode/u);
    expect(source).toMatch(/live browser-extension privacy URL currently returns HTTP 200/u);
    expect(source).toMatch(/Any later privacy-page wording change\s+must be merged to `main` and deployed/su);
    expect(source).toMatch(/suggestion-panel cleanup after\s+Apply/u);
    expect(source).toMatch(/StoreReady.+false/su);
    expect(source).not.toMatch(/LisanStudio-QA/u);
    expect(source).not.toMatch(/C:\\QA/u);
    expect(source).not.toMatch(/C:\\CodexProjects/u);
    expect(source).not.toMatch(/C:\\Users/u);
  });

  it("ships a V2 browser-extension validation summary for Phase 9 evidence", async () => {
    const source = await fs.readFile(
      path.join(repoRoot, "docs/testing/browser-extension-v2-validation.md"),
      "utf8",
    );

    for (const requiredText of [
      "Controlled Fixture Coverage",
      "textarea",
      "text-input",
      "simple-contenteditable",
      "shadow-dom",
      "iframe",
      "repeated-text",
      "RTL/mixed text",
      "large text refusal",
      "sensitive fields",
      "API unavailable",
      "paused/site-disabled",
      "keyboard-only card flow",
      "accessibility scan",
      "Real-Site Manual Coverage",
      "Gmail compose",
      "WhatsApp Web composer",
      "Google Docs",
      "plain contenteditable site",
      "framework-heavy editor",
      "WhiteKnight",
      "No raw live editor text",
      "docs/testing/reports/",
      "dist/browser-extension-manual-qa/",
      "documented limitation",
    ]) {
      expect(source).toContain(requiredText);
    }
  });

  it("keeps extension surfaces at WCAG AA text contrast with explicit backgrounds", async () => {
    const contentCss = await fs.readFile(
      path.join(extensionRoot, "src/content.css"),
      "utf8",
    );
    const popupHtml = await fs.readFile(path.join(extensionRoot, "popup.html"), "utf8");
    const optionsHtml = await fs.readFile(
      path.join(extensionRoot, "options.html"),
      "utf8",
    );

    expect(popupHtml).toMatch(/background:\s*#ffffff\b/iu);
    expect(optionsHtml).toMatch(/background:\s*#ffffff\b/iu);
    expect(contentCss).toMatch(/background:\s*#ffffff\b/iu);

    for (const [name, foreground, background] of [
      ["panel text", "#1d2421", "#ffffff"],
      ["panel muted text", "#52605a", "#ffffff"],
      ["panel code text", "#0f6b5c", "#ffffff"],
      ["panel button text", "#ffffff", "#0f6b5c"],
      ["static page text", "#171717", "#ffffff"],
      ["static page metadata text", "#525252", "#ffffff"],
    ]) {
      expect(contrastRatio(foreground, background), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("ships Windows forced-colors fallbacks for injected and static extension UI", async () => {
    const files = {
      "src/content.css": await fs.readFile(
        path.join(extensionRoot, "src/content.css"),
        "utf8",
      ),
      "popup.html": await fs.readFile(path.join(extensionRoot, "popup.html"), "utf8"),
      "options.html": await fs.readFile(
        path.join(extensionRoot, "options.html"),
        "utf8",
      ),
    };

    for (const [entry, source] of Object.entries(files)) {
      expect(source, entry).toMatch(/@media\s*\(\s*forced-colors:\s*active\s*\)/iu);
      expect(source, entry).toMatch(/\bCanvasText\b/u);
      expect(source, entry).toMatch(/\bButtonText\b/u);
    }

    expect(files["src/content.css"]).toMatch(/\bHighlight\b/u);
  });
});
