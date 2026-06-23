import { analyzeTextWithLocalApi } from "./localApi.js";
import { getExtensionSettings } from "./settings.js";

const ANALYZE_MESSAGE = "ALFARAHEEDI_ANALYZE_TEXT";
const MAX_TEXT_CHARS = 6_000;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== ANALYZE_MESSAGE) {
    return false;
  }

  if (typeof message.text !== "string" || !message.text.trim()) {
    sendResponse({
      ok: false,
      skipped: true,
      error: "No text to check.",
    });
    return false;
  }

  if (message.text.length > MAX_TEXT_CHARS) {
    sendResponse({
      ok: false,
      skipped: true,
      error: "Text is too long for local checking.",
    });
    return false;
  }

  getExtensionSettings()
    .then((settings) => {
      if (!settings.enabled) {
        return {
          skipped: true,
          error: "Alfaraheedi checking is paused.",
        };
      }

      return analyzeTextWithLocalApi({
        apiBaseUrl: settings.apiBaseUrl,
        text: message.text,
        writingMode: settings.writingMode,
      });
    })
    .then((analysis) => {
      if (analysis.skipped) {
        sendResponse({ ok: false, skipped: true, error: analysis.error });
        return;
      }
      sendResponse({ ok: true, analysis });
    })
    .catch((error) =>
      sendResponse({
        ok: false,
        error: "Alfaraheedi local API is unavailable.",
      }),
    );

  return true;
});
