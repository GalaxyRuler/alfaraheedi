import {
  getExtensionSettings,
  saveExtensionSettings,
} from "./settings.js";

const form = document.querySelector("#settings-form");
const apiBaseUrl = document.querySelector("#api-base-url");
const writingMode = document.querySelector("#writing-mode");
const enabled = document.querySelector("#enabled");
const disabledHosts = document.querySelector("#disabled-hosts");
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
    status.textContent =
      error instanceof Error ? error.message : "Could not save settings.";
  }
});

async function loadSettings() {
  try {
    renderSettings(await getExtensionSettings());
  } catch (error) {
    status.textContent =
      error instanceof Error ? error.message : "Could not load settings.";
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
