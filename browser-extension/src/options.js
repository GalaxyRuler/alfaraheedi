import {
  getExtensionSettings,
  saveExtensionSettings,
} from "./settings.js";

const form = document.querySelector("#settings-form");
const apiBaseUrl = document.querySelector("#api-base-url");
const writingMode = document.querySelector("#writing-mode");
const enabled = document.querySelector("#enabled");
const status = document.querySelector("#status");

loadSettings();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "";

  try {
    const saved = await saveExtensionSettings({
      apiBaseUrl: apiBaseUrl.value,
      writingMode: writingMode.value,
      enabled: enabled.checked,
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
  apiBaseUrl.value = settings.apiBaseUrl;
  writingMode.value = settings.writingMode;
  enabled.checked = settings.enabled;
}
