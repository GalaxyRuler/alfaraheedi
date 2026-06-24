import { checkLocalApiHealth } from "./localApi.js";
import {
  getExtensionSettings,
  hostFromUrl,
  isSiteDisabled,
  saveExtensionSettings,
  setSiteDisabled,
} from "./settings.js";

const PAGE_LOCATION_MESSAGE = "ALFARAHEEDI_PAGE_LOCATION";
const apiBaseUrl = document.querySelector("#api-base-url");
const writingMode = document.querySelector("#writing-mode");
const apiStatus = document.querySelector("#api-status");
const checkingStatus = document.querySelector("#checking-status");
const siteStatus = document.querySelector("#site-status");
const toggleEnabled = document.querySelector("#toggle-enabled");
const toggleSite = document.querySelector("#toggle-site");
const openOptions = document.querySelector("#open-options");
const status = document.querySelector("#status");
let currentSettings = null;
let currentTabUrl = null;

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

if (toggleSite) {
  toggleSite.addEventListener("click", async () => {
    if (!currentSettings || !currentTabUrl) return;
    status.textContent = "";

    try {
      const saved = await saveExtensionSettings(
        setSiteDisabled(
          currentSettings,
          currentTabUrl,
          !isSiteDisabled(currentSettings, currentTabUrl),
        ),
      );
      renderSettings(saved);
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : "Could not update this site.";
    }
  });
}

async function loadSettings() {
  try {
    currentTabUrl = await activeTabUrl();
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
  renderSiteStatus(settings);
  toggleEnabled.textContent = settings.enabled
    ? "Pause checking"
    : "Resume checking";
}

async function activeTabUrl() {
  if (typeof globalThis.chrome?.tabs?.query !== "function") return null;
  try {
    const [tab] = await globalThis.chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (typeof tab?.url === "string") return tab.url;
    return activeTabContentUrl(tab?.id);
  } catch {
    return null;
  }
}

async function activeTabContentUrl(tabId) {
  if (
    typeof tabId !== "number" ||
    typeof globalThis.chrome?.tabs?.sendMessage !== "function"
  ) {
    return null;
  }

  try {
    const response = await globalThis.chrome.tabs.sendMessage(tabId, {
      type: PAGE_LOCATION_MESSAGE,
    });
    return typeof response?.url === "string" ? response.url : null;
  } catch {
    return null;
  }
}

function renderSiteStatus(settings) {
  const host = hostFromUrl(currentTabUrl);
  if (!host) {
    if (siteStatus) siteStatus.textContent = "Unavailable";
    if (toggleSite) {
      toggleSite.disabled = true;
      toggleSite.textContent = "Current site unavailable";
    }
    return;
  }

  const disabled = isSiteDisabled(settings, currentTabUrl);
  if (siteStatus) {
    siteStatus.textContent = disabled ? `${host} disabled` : `${host} enabled`;
  }
  if (toggleSite) {
    toggleSite.disabled = false;
    toggleSite.textContent = disabled
      ? "Re-enable on this site"
      : "Disable on this site";
  }
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
