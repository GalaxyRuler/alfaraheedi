import fs from "node:fs";
import path from "node:path";

const addinRoot = process.argv[2];

if (!addinRoot) {
  console.error("Usage: node package-office-addin.mjs <office-addins-root>");
  process.exit(1);
}

const requiredEntries = [
  "manifest.xml",
  "README.md",
  "taskpane.html",
  "styles/taskpane.css",
  "src/localApi.js",
  "src/officeApi.js",
  "src/taskpane.js",
];

for (const entry of requiredEntries) {
  const fullPath = path.join(addinRoot, entry);
  if (!fs.existsSync(fullPath)) {
    console.error(`Required Office add-in package entry missing: ${entry}`);
    process.exit(1);
  }
}

console.log(JSON.stringify(requiredEntries, null, 2));
