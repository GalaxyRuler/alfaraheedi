import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const LOOPBACK_HOST_PERMISSION_PATTERN =
  /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/\*$/u;
const STATIC_IMPORT_PATTERN =
  /import\s+(?:[^'"]*?\s+from\s+)?["'](?<specifier>\.[^"']+)["'];?/gu;
const HTML_SCRIPT_SRC_PATTERN =
  /<script\b[^>]*\bsrc=["'](?<specifier>[^"']+)["'][^>]*><\/script>/giu;

export function validateBrowserExtensionManifest(manifest) {
  const errors = [];

  if (manifest?.manifest_version !== 3) {
    errors.push("manifest_version must be 3.");
  }
  if (!nonEmptyString(manifest?.name)) {
    errors.push("name is required.");
  } else if (manifest.name.length > 75) {
    errors.push("name must be 75 characters or fewer.");
  }
  if (!nonEmptyString(manifest?.short_name) || manifest.short_name.length > 12) {
    errors.push("short_name is required and must be 12 characters or fewer.");
  }
  if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/u.test(manifest?.version ?? "")) {
    errors.push("version must use x.y.z or x.y.z.n format.");
  }
  if (!nonEmptyString(manifest?.description)) {
    errors.push("description is required.");
  } else if (manifest.description.length > 132) {
    errors.push("description must be 132 characters or fewer.");
  }
  validateIcons(manifest?.icons, errors);
  validateAction(manifest?.action, manifest?.icons, errors);
  if (
    !Array.isArray(manifest?.permissions) ||
    manifest.permissions.length !== 1 ||
    manifest.permissions[0] !== "storage"
  ) {
    errors.push("permissions must contain only storage for extension settings.");
  }
  if (
    !Array.isArray(manifest?.host_permissions) ||
    manifest.host_permissions.length === 0 ||
    !manifest.host_permissions.every((permission) =>
      LOOPBACK_HOST_PERMISSION_PATTERN.test(permission),
    )
  ) {
    errors.push("host_permissions must be loopback API URLs only.");
  }
  if (manifest?.optional_permissions) {
    errors.push("optional_permissions are not allowed in the v0.7 extension package.");
  }
  if (manifest?.optional_host_permissions) {
    errors.push("optional_host_permissions are not allowed in the v0.7 extension package.");
  }
  if (manifest?.externally_connectable) {
    errors.push("externally_connectable is not allowed in the v0.7 extension package.");
  }
  if (manifest?.web_accessible_resources) {
    errors.push("web_accessible_resources are not allowed in the v0.7 extension package.");
  }
  if (!nonEmptyString(manifest?.background?.service_worker)) {
    errors.push("background.service_worker is required.");
  }
  if (manifest?.background?.type !== "module") {
    errors.push("background.type must be module.");
  }
  if (!Array.isArray(manifest?.content_scripts) || manifest.content_scripts.length === 0) {
    errors.push("at least one content script is required.");
  }
  if (manifest.options_page && !nonEmptyString(manifest.options_page)) {
    errors.push("options_page must be a non-empty string when present.");
  }

  for (const [index, script] of (manifest?.content_scripts ?? []).entries()) {
    if (
      !Array.isArray(script.matches) ||
      script.matches.length !== 2 ||
      !script.matches.includes("http://*/*") ||
      !script.matches.includes("https://*/*")
    ) {
      errors.push(`content_scripts[${index}].matches must contain only http and https pages.`);
    }
    if (!Array.isArray(script.js) || script.js.length === 0) {
      errors.push(`content_scripts[${index}].js is required.`);
    }
    if (!Array.isArray(script.css) || script.css.length === 0) {
      errors.push(`content_scripts[${index}].css is required.`);
    }
    if (script.run_at !== "document_idle") {
      errors.push(`content_scripts[${index}].run_at must be document_idle.`);
    }
    if (script.all_frames !== true) {
      errors.push(`content_scripts[${index}].all_frames must be true for iframe editors.`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  return manifest;
}

export async function listBrowserExtensionPackageEntries(extensionRoot) {
  const root = path.resolve(extensionRoot);
  const manifest = validateBrowserExtensionManifest(
    JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8")),
  );
  const entries = new Set(["manifest.json"]);
  await addRuntimeEntry(root, entries, "PRIVACY_POLICY.md");

  for (const icon of Object.values(manifest.icons)) {
    await addRuntimeEntry(root, entries, icon);
  }
  if (manifest.action?.default_popup) {
    await addRuntimeEntry(root, entries, manifest.action.default_popup);
  }
  await addRuntimeEntry(root, entries, manifest.background.service_worker);
  if (manifest.options_page) await addRuntimeEntry(root, entries, manifest.options_page);

  for (const script of manifest.content_scripts) {
    for (const js of script.js) await addRuntimeEntry(root, entries, js);
    for (const css of script.css) await addRuntimeEntry(root, entries, css);
  }

  return [...entries].sort((a, b) => a.localeCompare(b));
}

async function addRuntimeEntry(root, entries, relativePath) {
  assertSafeRelativePath(relativePath);
  const normalized = normalizeEntry(relativePath);
  if (entries.has(normalized)) return;

  const absolutePath = path.join(root, normalized);
  const stat = await fs.stat(absolutePath);
  if (!stat.isFile()) throw new Error(`Package entry is not a file: ${normalized}`);
  entries.add(normalized);

  if (normalized.endsWith(".js")) {
    const source = await fs.readFile(absolutePath, "utf8");
    for (const specifier of staticImportSpecifiers(source)) {
      const imported = normalizeEntry(path.join(path.dirname(normalized), specifier));
      await addRuntimeEntry(root, entries, imported);
    }
  }

  if (normalized.endsWith(".html")) {
    const source = await fs.readFile(absolutePath, "utf8");
    for (const specifier of htmlScriptSpecifiers(source)) {
      const imported = normalizeEntry(path.join(path.dirname(normalized), specifier));
      await addRuntimeEntry(root, entries, imported);
    }
  }
}

function staticImportSpecifiers(source) {
  return [...source.matchAll(STATIC_IMPORT_PATTERN)].map(
    (match) => match.groups.specifier,
  );
}

function htmlScriptSpecifiers(source) {
  return [...source.matchAll(HTML_SCRIPT_SRC_PATTERN)].map(
    (match) => match.groups.specifier,
  );
}

function assertSafeRelativePath(relativePath) {
  const normalized = normalizeEntry(relativePath);
  if (
    path.isAbsolute(relativePath) ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new Error(`Unsafe extension package path: ${relativePath}`);
  }
}

function normalizeEntry(relativePath) {
  return relativePath.replaceAll("\\", "/").replace(/^\.\//u, "");
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateIcons(icons, errors) {
  const requiredSizes = ["16", "32", "48", "128"];
  if (!icons || typeof icons !== "object" || Array.isArray(icons)) {
    errors.push("icons must declare 16, 32, 48, and 128 PNG entries.");
    return;
  }

  for (const size of requiredSizes) {
    const iconPath = icons[size];
    if (!nonEmptyString(iconPath)) {
      errors.push(`icons.${size} is required.`);
      continue;
    }
    if (!iconPath.endsWith(".png")) {
      errors.push(`icons.${size} must point to a PNG file.`);
    }
  }
}

function validateAction(action, icons, errors) {
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    errors.push("action is required for toolbar access.");
    return;
  }

  if (!nonEmptyString(action.default_title)) {
    errors.push("action.default_title is required.");
  }
  if (!nonEmptyString(action.default_popup)) {
    errors.push("action.default_popup is required.");
  }
  if (
    !action.default_icon ||
    typeof action.default_icon !== "object" ||
    Array.isArray(action.default_icon)
  ) {
    errors.push("action.default_icon must declare toolbar icon entries.");
    return;
  }

  for (const size of ["16", "32"]) {
    if (!nonEmptyString(action.default_icon[size])) {
      errors.push(`action.default_icon.${size} is required.`);
      continue;
    }
    if (icons?.[size] && action.default_icon[size] !== icons[size]) {
      errors.push(`action.default_icon.${size} must reuse icons.${size}.`);
    }
  }
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll("\\", "/")}`) {
  const rootArg = process.argv[2] ?? "browser-extension";
  const entries = await listBrowserExtensionPackageEntries(rootArg);
  process.stdout.write(`${JSON.stringify(entries, null, 2)}\n`);
}
