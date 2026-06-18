import type { Category, Severity, Suggestion } from "../api/types";

// Category/severity labels per UI language. Consumed through the i18n context,
// which picks the active language's form.
export const CATEGORY_LABELS: Record<Category, { ar: string; en: string }> = {
  Orthography: { ar: "إملاء", en: "Orthography" },
  Punctuation: { ar: "ترقيم", en: "Punctuation" },
  Spacing: { ar: "مسافات", en: "Spacing" },
  Spelling: { ar: "تدقيق إملائي", en: "Spelling" },
  Grammar: { ar: "نحو", en: "Grammar" },
  Style: { ar: "أسلوب", en: "Style" },
  ProtectedSpan: { ar: "نطاق محمي", en: "Protected span" },
};

export const SEVERITY_LABELS: Record<Severity, { ar: string; en: string }> = {
  Error: { ar: "خطأ", en: "Error" },
  Warning: { ar: "تنبيه", en: "Warning" },
  Info: { ar: "معلومة", en: "Info" },
};

// Arabic rule copy keyed by the engine's rule source. The engine returns English
// descriptions/explanations (shared with the CLI/JSON consumers); rather than
// change that output we localize for the UI in Arabic and fall back to the
// engine string for any source we don't yet have copy for. English UI uses the
// engine string directly.
export const RULE_TEXT_AR: Record<string, string> = {
  "arabic:tatweel": "إزالة علامات التطويل من النص.",
  "arabic:repeated-space": "دمج المسافات المتكررة في النص العربي.",
  "arabic:space-before-punctuation": "إزالة المسافة قبل علامة الترقيم العربية.",
  "arabic:latin-comma": "استخدام الفاصلة العربية «،» بدل الفاصلة اللاتينية.",
  "arabic:latin-question-mark":
    "استخدام علامة الاستفهام العربية «؟» بدل اللاتينية.",
};

export interface SuggestionGroup {
  category: Category;
  suggestions: Suggestion[];
}

// Group by category, ordered by first appearance in the analysis so the panel
// mirrors reading order rather than an arbitrary enum order.
export function groupByCategory(suggestions: Suggestion[]): SuggestionGroup[] {
  const groups = new Map<Category, Suggestion[]>();
  for (const suggestion of suggestions) {
    const bucket = groups.get(suggestion.category);
    if (bucket) {
      bucket.push(suggestion);
    } else {
      groups.set(suggestion.category, [suggestion]);
    }
  }
  return [...groups.entries()].map(([category, items]) => ({
    category,
    suggestions: items,
  }));
}

export function countSafe(suggestions: Suggestion[]): number {
  return suggestions.filter((s) => s.safe_auto_apply).length;
}

// A human-friendly rendering of a replacement candidate. Empty strings mean
// "delete this span", which would otherwise render as nothing; the caller passes
// the localized delete label.
export function renderReplacement(value: string, deleteLabel: string): string {
  if (value === "") return deleteLabel;
  if (value.trim() === "") return `␣×${value.length}`;
  return value;
}
