import "./editorDiscovery.js";
import "./textProjection.js";
import "./suggestionAnchors.js";
import "./applySuggestion.js";
import "./overlayLayer.js";
import "./suggestionCard.js";

const runtime = globalThis.NahouExtensionRuntime;

export const discoverEditorSurface = runtime.discoverEditorSurface;
export const renderSuggestionMarks = runtime.renderSuggestionMarks;
export const clearSuggestionMarks = runtime.clearSuggestionMarks;
export const renderSuggestionPanel = runtime.renderSuggestionPanel;
export const clearSuggestionPanel = runtime.clearSuggestionPanel;
export const applySuggestionToEditor = runtime.applySuggestionToEditor;
export const createSuggestionAnchor = runtime.createSuggestionAnchor;
