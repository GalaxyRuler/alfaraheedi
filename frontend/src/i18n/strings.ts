// UI language is a user choice (Settings). Default is Arabic. Every chrome
// string lives here with an `ar` and `en` form; components read them through
// the i18n context so switching language re-renders the whole UI.

export type Lang = "ar" | "en";

export const LANGS: { value: Lang; label: string }[] = [
  { value: "ar", label: "العربية" },
  { value: "en", label: "English" },
];

type Entry = { ar: string; en: string };

export const STRINGS = {
  brandName: { ar: "الفراهيدي", en: "Alfaraheedi" },
  brandTag: { ar: "مدقّق كتابة محلي", en: "local-first writing checker" },

  engineOnline: { ar: "المحرك متصل", en: "Engine online" },
  engineOffline: { ar: "المحرك غير متصل", en: "Engine offline" },
  engineChecking: { ar: "جارٍ الفحص…", en: "Checking…" },

  navPanels: { ar: "اللوحات", en: "Panels" },
  navRules: { ar: "القواعد", en: "Rules" },
  navLlm: { ar: "النموذج المحلي", en: "Local LLM" },
  navSettings: { ar: "الإعدادات", en: "Settings" },
  languageSwitch: { ar: "لغة الواجهة", en: "Interface language" },
  reportTitle: { ar: "تقرير ملاحظات", en: "Feedback report" },
  skipEditor: { ar: "انتقال إلى المحرر", en: "Skip to editor" },

  analyze: { ar: "تحليل", en: "Analyze" },
  analyzing: { ar: "جارٍ التحليل…", en: "Analyzing…" },
  applySafe: { ar: "إصلاحات آمنة", en: "Apply safe" },
  applySafeHint: {
    ar: "يطبّق الإصلاحات الآمنة عبر ‎/v1/apply",
    en: "Applies safe fixes via /v1/apply",
  },
  llmSuggest: { ar: "اقتراح النموذج", en: "LLM suggestion" },
  llmSuggesting: { ar: "جارٍ اقتراح النموذج…", en: "Getting LLM suggestion…" },
  llmSuggestHint: {
    ar: "يطلب اقتراحًا يدوي التطبيق من النموذج المحلي",
    en: "Requests a manually applied suggestion from the local model",
  },
  copy: { ar: "نسخ", en: "Copy" },
  copied: { ar: "تم النسخ ✓", en: "Copied ✓" },
  example: { ar: "مثال", en: "Example" },
  clear: { ar: "مسح", en: "Clear" },

  editorPlaceholder: {
    ar: "اكتب أو ألصق نصًا هنا، ثم اضغط «تحليل».",
    en: "Write or paste text here, then click Analyze.",
  },
  editorAria: { ar: "محرر النص", en: "Text editor" },
  privacyLocal: {
    ar: "محلي · النص يبقى على جهازك",
    en: "Local · text stays on your machine",
  },
  charCount: { ar: "حرفًا", en: "chars" },

  suggestionsTitle: { ar: "الاقتراحات", en: "Suggestions" },
  safeShort: { ar: "آمنة", en: "safe" },
  stateAnalyzing: { ar: "جارٍ التحليل…", en: "Analyzing…" },
  stateAnalyzeFailed: { ar: "تعذّر التحليل.", en: "Analysis failed." },
  stateIdleTitle: { ar: "لا توجد اقتراحات بعد.", en: "No suggestions yet." },
  stateIdleHint: {
    ar: "اكتب نصًا واضغط «تحليل» لرؤية الإصلاحات الآمنة والاقتراحات.",
    en: "Write text and click Analyze to see safe fixes and suggestions.",
  },
  stateNone: {
    ar: "لا اقتراحات — النص نظيف وفق القواعد الحالية.",
    en: "No suggestions — the text is clean for the current rule set.",
  },
  llmSuggestionTitle: { ar: "اقتراح النموذج المحلي", en: "Local LLM suggestion" },
  llmSuggestionFailed: {
    ar: "تعذّر إنشاء اقتراح من النموذج المحلي.",
    en: "Could not create a local LLM suggestion.",
  },
  llmApplySuggestion: { ar: "تطبيق يدوي", en: "Apply manually" },
  reportAnalysis: { ar: "تقرير التحليل", en: "Report analysis" },
  reportSuggestion: { ar: "تقرير الاقتراح", en: "Report suggestion" },

  badgeSafe: { ar: "إصلاح آمن", en: "Safe fix" },
  badgeSuggest: { ar: "اقتراح فقط", en: "Suggest only" },
  badgeSafeShort: { ar: "آمن", en: "Safe" },
  badgeSuggestShort: { ar: "اقتراح", en: "Suggest" },
  confidence: { ar: "الثقة", en: "Confidence" },
  noReplacement: { ar: "لا بديل", en: "no replacement" },
  locateHint: { ar: "حدد موضع الاقتراح في النص", en: "Locate this span in the text" },
  applyOneHint: { ar: "طبّق هذا البديل", en: "Apply this replacement" },
  deleteToken: { ar: "∅ (حذف)", en: "∅ (delete)" },

  close: { ar: "إغلاق", en: "Close" },
  retry: { ar: "إعادة المحاولة", en: "Retry" },
  loading: { ar: "جارٍ التحميل…", en: "Loading…" },

  reportIntro: {
    ar: "يُنشأ التقرير محليًا. لا يُرسل شيء إلا إذا نسخته أو فتحت مسألة GitHub بنفسك.",
    en: "The report is generated locally. Nothing is sent unless you copy it or open the GitHub issue yourself.",
  },
  reportSummary: { ar: "ملخص التقرير", en: "Report summary" },
  reportKind: { ar: "نوع التقرير", en: "Report kind" },
  reportKindSuggestion: { ar: "اقتراح محدد", en: "Specific suggestion" },
  reportKindAnalysis: { ar: "تحليل كامل", en: "Full analysis" },
  reportSuggestionCount: { ar: "عدد الاقتراحات", en: "Suggestion count" },
  reportSource: { ar: "المصدر", en: "Source" },
  reportRawMode: { ar: "النص المرفق", en: "Included text" },
  reportRawNone: { ar: "بدون نص خام", en: "No raw text" },
  reportRawSelected: { ar: "المقطع المحدد فقط", en: "Selected span only" },
  reportRawFull: { ar: "النص الكامل", en: "Full text" },
  reportRawHint: {
    ar: "الافتراضي لا يرفق النص. أرفق مقطعًا أو النص الكامل فقط عند الحاجة.",
    en: "Default excludes the draft. Include a span or full text only when needed.",
  },
  reportOutput: { ar: "نص التقرير", en: "Report text" },
  reportCopied: { ar: "نُسخ التقرير", en: "Report copied" },
  reportCopy: { ar: "نسخ التقرير", en: "Copy report" },
  reportOpenIssue: { ar: "فتح مسألة GitHub", en: "Open GitHub issue" },

  rulesIntro: {
    ar: "القواعد المفعّلة حاليًا من المحرك (‎GET /v1/rules‎). الإصلاحات الآمنة فقط تُطبَّق تلقائيًا.",
    en: "Rules currently enabled in the engine (GET /v1/rules). Only safe fixes are auto-applied.",
  },
  rulesLoadFailed: { ar: "تعذّر تحميل القواعد.", en: "Could not load rules." },

  llmIntro: {
    ar: "حالة النموذج اللغوي المحلي (‎GET /v1/llm/status‎). السياسة: اقتراحات فقط.",
    en: "Local language-model status (GET /v1/llm/status). Policy: suggestion-only.",
  },
  llmLoadFailed: {
    ar: "تعذّر الوصول إلى حالة النموذج — تُعرض السياسة الافتراضية.",
    en: "Could not reach model status — showing the default policy.",
  },
  llmPolicyNote: {
    ar: "ميزات النموذج المحلي اقتراحية فقط ولا تُطبَّق تلقائيًا. لا تُرفق أوزان نماذج مع التطبيق.",
    en: "Local model features are suggestion-only and never auto-apply. No model weights are bundled.",
  },
  llmConfigured: { ar: "متاح", en: "Available" },
  llmDefault: { ar: "النموذج الافتراضي", en: "Default model" },
  llmRuntime: { ar: "الخادم المحلي", en: "Local runtime" },
  llmRuntimeModel: { ar: "النموذج النشط", en: "Active model" },
  llmPolicy: { ar: "السياسة", en: "Policy" },
  llmBundled: { ar: "أوزان مرفقة", en: "Bundled weights" },
  yes: { ar: "نعم", en: "Yes" },
  no: { ar: "لا", en: "No" },

  settingsLanguage: { ar: "لغة الواجهة", en: "Interface language" },
  settingsApiUrl: { ar: "عنوان الواجهة البرمجية", en: "API base URL" },
  settingsDefault: { ar: "الافتراضي", en: "Default" },
  engineUnavailablePrefix: {
    ar: "تعذّر الوصول إلى المحرك على ",
    en: "Can't reach the engine at ",
  },
  engineUnavailableHint: {
    ar: "أعد تشغيل تطبيق الفراهيدي أو الخادم المحلي.",
    en: "Restart the Alfaraheedi app or local server.",
  },
  settingsDirection: { ar: "اتجاه المحرر", en: "Editor direction" },
  dirRtl: { ar: "من اليمين", en: "Right-to-left" },
  dirLtr: { ar: "من اليسار", en: "Left-to-right" },
  dirAuto: { ar: "تلقائي", en: "Auto" },
  settingsRemember: { ar: "حفظ المسودة محليًا", en: "Remember draft locally" },
  settingsRememberHint: {
    ar: "عند التفعيل، يُحفظ النص في هذا المتصفح فقط (localStorage). مُعطّل افتراضيًا حفاظًا على الخصوصية.",
    en: "When on, text is saved in this browser only (localStorage). Off by default for privacy.",
  },
  settingsReset: { ar: "إعادة الضبط الافتراضي", en: "Reset to defaults" },
} satisfies Record<string, Entry>;

export type StringKey = keyof typeof STRINGS;

export function translate(lang: Lang, key: StringKey): string {
  return STRINGS[key][lang];
}
