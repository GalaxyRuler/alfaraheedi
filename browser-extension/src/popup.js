import { checkLocalApiHealth } from "./localApi.js";
import { getExtensionSettings, saveExtensionSettings } from "./settings.js";

const apiBaseUrl = document.querySelector("#api-base-url");
const writingMode = document.querySelector("#writing-mode");
const apiStatus = document.querySelector("#api-status");
const checkingStatus = document.querySelector("#checking-status");
const toggleEnabled = document.querySelector("#toggle-enabled");
const openOptions = document.querySelector("#open-options");
const status = document.querySelector("#status");
let currentSettings = null;

loadSettings();

openOptions.addEventListener("click", async () => {
  status.textContent = "";
  try {
    await chrome.runtime.openOptionsPage();
    window.close();
  } catch (error) {
    status.textContent =
      error instanceof Error ? error.message : "Could not open settings.";
  }
});

toggleEnabled.addEventListener("click", async () => {
  if (!currentSettings) return;
  status.textContent = "";

  try {
    const saved = await saveExtensionSettings({
      ...currentSettings,
      enabled: !currentSettings.enabled,
    });
    renderSettings(saved);
  } catch (error) {
    status.textContent =
      error instanceof Error ? error.message : "Could not update checking.";
  }
});

async function loadSettings() {
  try {
    const settings = await getExtensionSettings();
    renderSettings(settings);
    await renderApiHealth(settings.apiBaseUrl);
  } catch (error) {
    status.textContent =
      error instanceof Error ? error.message : "Could not load settings.";
  }
}

function renderSettings(settings) {
  currentSettings = settings;
  apiBaseUrl.textContent = settings.apiBaseUrl;
  writingMode.textContent = labelWritingMode(settings.writingMode);
  checkingStatus.textContent = settings.enabled ? "On" : "Paused";
  toggleEnabled.textContent = settings.enabled
    ? "Pause checking"
    : "Resume checking";
}

async function renderApiHealth(baseUrl) {
  apiStatus.textContent = "Checking...";
  const health = await checkLocalApiHealth({ apiBaseUrl: baseUrl });
  apiStatus.textContent = health.ok
    ? "Local API reachable."
    : "Local API unreachable.";
}

function labelWritingMode(mode) {
  switch (mode) {
    case "arabic":
      return "Arabic";
    case "english":
      return "English";
    case "mixed":
      return "Mixed";
    default:
      return "Auto";
  }
}
