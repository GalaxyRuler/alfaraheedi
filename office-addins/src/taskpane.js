import {
  DEFAULT_API_BASE_URL,
  analyzeTextWithLocalApi,
  applySafeWithLocalApi,
} from "./localApi.js";
import {
  getOfficeHostLabel,
  getCurrentOfficeSelection,
  OFFICE_SELECTION_STATES,
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

function setApplyEnabled(enabled) {
  byId("apply-safe").disabled = !enabled;
}

function setCopyEnabled(enabled) {
  byId("copy-corrected").disabled = !enabled;
}

function resetSelectionState() {
  state.selectedText = "";
  state.correctedText = "";
  byId("corrected-preview").value = "";
  setApplyEnabled(false);
  setCopyEnabled(false);
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
    item.dir = "auto";
    item.textContent = suggestionText(suggestion);
    list.append(item);
  }

  if (suggestions.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No active suggestions.";
    list.append(item);
  }
}

async function checkSelection() {
  const settings = getSettings();
  setStatus("Reading selected Office text...");
  const selection = await getCurrentOfficeSelection();
  if (selection.state === OFFICE_SELECTION_STATES.NO_SELECTION) {
    resetSelectionState();
    setStatus("Select text in Word or PowerPoint first.");
    return;
  }
  if (selection.state === OFFICE_SELECTION_STATES.UNSUPPORTED_SELECTION) {
    resetSelectionState();
    setStatus("This Office selection is not supported. Copy the selected text manually and use the desktop app.");
    return;
  }

  const selectedText = selection.text;
  state.selectedText = selectedText;
  let analysis;
  try {
    analysis = await analyzeTextWithLocalApi({
      ...settings,
      text: selectedText,
    });
  } catch {
    resetSelectionState();
    setStatus("Disconnected local API. Start Nahou, then check the selection again.");
    return;
  }

  renderSuggestions(analysis);
  state.correctedText = selectedText;
  byId("corrected-preview").value = selectedText;
  setApplyEnabled(true);
  setCopyEnabled(true);
  setStatus(`Suggestions available for ${selectedText.length} selected characters.`);
}

async function applySafeFixes() {
  if (!state.selectedText) {
    setStatus("Check a selection before applying safe fixes.");
    return;
  }

  const settings = getSettings();
  setStatus("Applying safe fixes locally...");
  let outcome;
  try {
    outcome = await applySafeWithLocalApi({
      ...settings,
      text: state.selectedText,
    });
  } catch {
    setStatus("Disconnected local API. Copy the current preview or try again after starting Nahou.");
    setCopyEnabled(Boolean(state.correctedText));
    return;
  }

  const corrected = outcome.corrected_text || outcome.text || state.selectedText;
  state.correctedText = corrected;
  byId("corrected-preview").value = corrected;
  setCopyEnabled(true);

  const replacement = await replaceSelectedTextInOffice({
    expectedText: state.selectedText,
    replacementText: corrected,
  });
  if (replacement.state === OFFICE_SELECTION_STATES.STALE_SELECTION) {
    setApplyEnabled(false);
    setStatus("Selection changed before replacement. Re-check the current selection or copy the corrected text.");
    return;
  }
  if (replacement.state === OFFICE_SELECTION_STATES.NO_SELECTION) {
    setApplyEnabled(false);
    setStatus("No Office selection is active. Re-select the text or copy the corrected text.");
    return;
  }
  if (replacement.state === OFFICE_SELECTION_STATES.UNSUPPORTED_SELECTION) {
    setApplyEnabled(false);
    setStatus("This Office selection cannot be replaced safely. Copy the corrected text instead.");
    return;
  }

  setApplyEnabled(false);
  setStatus("Replacement applied to the current Office selection.");
}

async function copyCorrectedText() {
  const text = byId("corrected-preview").value;
  if (!text) {
    setStatus("No corrected text is available to copy.");
    return;
  }

  await navigator.clipboard.writeText(text);
  setStatus("Corrected text copied.");
}

function wireEvents() {
  byId("check-selection").addEventListener("click", () => {
    checkSelection().catch((error) => setStatus(error.message));
  });
  byId("apply-safe").addEventListener("click", () => {
    applySafeFixes().catch((error) => setStatus(error.message));
  });
  byId("copy-corrected").addEventListener("click", () => {
    copyCorrectedText().catch(() => setStatus("Could not copy corrected text."));
  });
}

Office.onReady(() => {
  byId("host-label").textContent = getOfficeHostLabel();
  wireEvents();
});
