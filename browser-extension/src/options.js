import {
  DEFAULT_EXTENSION_SETTINGS,
  getExtensionSettings,
  LOOPBACK_API_URL_ERROR,
  saveExtensionSettings,
} from "./settings.js";

const form = document.querySelector("#settings-form");
const apiBaseUrl = document.querySelector("#api-base-url");
const writingMode = document.querySelector("#writing-mode");
const enabled = document.querySelector("#enabled");
const disabledHosts = document.querySelector("#disabled-hosts");
const resetSettings = document.querySelector("#reset-settings");
const status = document.querySelector("#status");
let currentSettings = null;

loadSettings();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "";

  try {
    const saved = await saveExtensionSettings({
      apiBaseUrl: apiBaseUrl.value,
      writingMode: writingMode.value,
      enabled: enabled.checked,
      disabledHosts: disabledHosts
        ? disabledHosts.value.split(/\r?\n/u)
        : currentSettings?.disabledHosts,
    });
    renderSettings(saved);
    status.textContent = "Saved.";
  } catch (error) {
    status.textContent = safeOptionsError(error, "Could not save settings.");
  }
});

if (resetSettings) {
  resetSettings.addEventListener("click", async () => {
    status.textContent = "";

    try {
      const saved = await saveExtensionSettings(DEFAULT_EXTENSION_SETTINGS);
      renderSettings(saved);
      status.textContent = "Reset to defaults.";
    } catch (error) {
      status.textContent = safeOptionsError(error, "Could not reset settings.");
    }
  });
}

async function loadSettings() {
  try {
    renderSettings(await getExtensionSettings());
  } catch (error) {
    status.textContent = safeOptionsError(error, "Could not load settings.");
  }
}

function renderSettings(settings) {
  currentSettings = settings;
  apiBaseUrl.value = settings.apiBaseUrl;
  writingMode.value = settings.writingMode;
  enabled.checked = settings.enabled;
  if (disabledHosts) {
    disabledHosts.value = settings.disabledHosts.join("\n");
  }
}

function safeOptionsError(error, fallback) {
  if (error instanceof Error && error.message === LOOPBACK_API_URL_ERROR) {
    return error.message;
  }
  return fallback;
}
