import {
  DEFAULT_API_BASE_URL,
  analyzeTextWithLocalApi,
  applySafeWithLocalApi,
} from "./localApi.js";
import {
  getOfficeHostLabel,
  getSelectedTextFromOffice,
  replaceSelectedTextInOffice,
} from "./officeApi.js";

const state = {
  selectedText: "",
  correctedText: "",
};

function byId(id) {
  return document.getElementById(id);
}

function setStatus(message) {
  byId("status-text").textContent = message;
}

function getSettings() {
  return {
    apiBaseUrl: byId("api-url").value || DEFAULT_API_BASE_URL,
    writingMode: byId("writing-mode").value || "auto",
  };
}

function suggestionText(suggestion) {
  const replacement = suggestion.replacement || suggestion.replace_with || "";
  const explanation = suggestion.explanation || suggestion.message || "Review suggestion.";
  const category = suggestion.category || suggestion.rule_id || "writing";
  return replacement ? `${category}: ${explanation} -> ${replacement}` : `${category}: ${explanation}`;
}

function renderSuggestions(analysis) {
  const list = byId("suggestions-list");
  list.replaceChildren();
  const suggestions = Array.isArray(analysis?.suggestions) ? analysis.suggestions : [];

  for (const suggestion of suggestions) {
    const item = document.createElement("li");
    item.textContent = suggestionText(suggestion);
    list.append(item);
  }

  if (suggestions.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No suggestions returned.";
    list.append(item);
  }
}

async function checkSelection() {
  const settings = getSettings();
  setStatus("Reading selected Office text...");
  const selectedText = await getSelectedTextFromOffice();
  if (!selectedText || !selectedText.trim()) {
    state.selectedText = "";
    state.correctedText = "";
    byId("corrected-preview").value = "";
    byId("apply-safe").disabled = true;
    setStatus("Select text in Word or PowerPoint first.");
    return;
  }

  state.selectedText = selectedText;
  const analysis = await analyzeTextWithLocalApi({
    ...settings,
    text: selectedText,
  });
  renderSuggestions(analysis);
  state.correctedText = selectedText;
  byId("corrected-preview").value = selectedText;
  byId("apply-safe").disabled = false;
  setStatus(`Checked ${selectedText.length} characters locally.`);
}

async function applySafeFixes() {
  if (!state.selectedText) {
    setStatus("Check a selection before applying safe fixes.");
    return;
  }

  const settings = getSettings();
  setStatus("Applying safe fixes locally...");
  const outcome = await applySafeWithLocalApi({
    ...settings,
    text: state.selectedText,
  });
  const corrected = outcome.corrected_text || outcome.text || state.selectedText;
  state.correctedText = corrected;
  byId("corrected-preview").value = corrected;
  await replaceSelectedTextInOffice(corrected);
  setStatus("Safe fixes replaced the current Office selection.");
}

function wireEvents() {
  byId("check-selection").addEventListener("click", () => {
    checkSelection().catch((error) => setStatus(error.message));
  });
  byId("apply-safe").addEventListener("click", () => {
    applySafeFixes().catch((error) => setStatus(error.message));
  });
}

Office.onReady(() => {
  byId("host-label").textContent = getOfficeHostLabel();
  wireEvents();
});
