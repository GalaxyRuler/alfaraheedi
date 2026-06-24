import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import type {
  LlmDoctorOutcome,
  LlmDoctorReport,
  LlmSuggestion,
  Suggestion,
} from "../api/types";
import {
  applySuggestionReplacement,
  buildPrivacySafeSuggestionReport,
  companionClient,
  DEFAULT_COMPANION_SETTINGS,
  type CapturePreference,
  type CaptureMethod,
  type CaptureResult,
  type CommandError,
  type CompanionSettings,
  type LlmRuntimePreset,
  type WritingMode,
} from "../api/companion";
import { countSafe, groupByCategory, renderReplacement } from "../lib/format";
import { I18nProvider, useI18n } from "../i18n/i18n";
import { LANGS } from "../i18n/strings";
import { CheckIcon, CopyIcon, ScanIcon, ShieldIcon } from "./Icons";

const WRITING_MODES: { value: WritingMode; label: { ar: string; en: string } }[] = [
  { value: "auto", label: { ar: "تلقائي", en: "Auto" } },
  { value: "arabic", label: { ar: "عربي", en: "Arabic" } },
  { value: "english", label: { ar: "إنجليزي", en: "English" } },
  { value: "mixed", label: { ar: "مختلط", en: "Mixed" } },
];

const CAPTURE_PREFERENCES: {
  value: CapturePreference;
  label: { ar: string; en: string };
}[] = [
  { value: "auto", label: { ar: "تلقائي", en: "Auto" } },
  { value: "clipboard_first", label: { ar: "الحافظة أولًا", en: "Clipboard first" } },
  { value: "uia_first", label: { ar: "UIA أولًا", en: "UIA first" } },
];

const LLM_RUNTIME_PRESETS: {
  value: LlmRuntimePreset;
  label: { ar: string; en: string };
  hint: { ar: string; en: string };
}[] = [
  {
    value: "llama_cpp_server",
    label: { ar: "llama.cpp server", en: "llama.cpp server" },
    hint: {
      ar: "المسار المدعوم افتراضيًا عبر خادم محلي متوافق مع OpenAI.",
      en: "Default supported path through a local OpenAI-compatible server.",
    },
  },
  {
    value: "llama_cpp_python_server",
    label: { ar: "llama-cpp-python", en: "llama-cpp-python" },
    hint: {
      ar: "خيار متقدم عندما يكون خادم Python متوافقًا مع واجهة OpenAI.",
      en: "Advanced option when the Python server exposes the OpenAI-compatible API.",
    },
  },
  {
    value: "onnx_runtime_genai_future",
    label: { ar: "ONNX Runtime GenAI", en: "ONNX Runtime GenAI" },
    hint: {
      ar: "مسار مدمج قيد الدراسة بعد v1.0، وليس مسار التشغيل الحالي.",
      en: "Investigated future embedded path after v1.0, not the current runtime path.",
    },
  },
];

const LOCAL_LLM_CONSENT =
  "Nahou will send the selected text to your configured local runtime at 127.0.0.1 or localhost. Do not use this if that runtime is not controlled by you.";

function captureMethodLabel(method: CaptureMethod | undefined, lang: "ar" | "en") {
  if (method === "windows_uia_text_pattern") {
    return lang === "ar" ? "التقاط عبر Windows UI Automation" : "Windows UI Automation capture";
  }
  return lang === "ar" ? "التقاط عبر الحافظة" : "Clipboard capture";
}

function captureNotice(result: CaptureResult, lang: "ar" | "en"): string | null {
  if (result.restore_warning) return result.restore_warning;
  if (result.capture_method === "windows_uia_text_pattern") {
    return lang === "ar"
      ? "التُقط النص عبر Windows UI Automation."
      : "Captured through Windows UI Automation.";
  }
  if (result.capture_method === "clipboard_shortcut") {
    return lang === "ar"
      ? "التُقط النص عبر الحافظة. استُعيدت الحافظة عند الإمكان."
      : "Captured through clipboard fallback. Clipboard was restored when possible.";
  }
  return null;
}

export function CompanionRoot() {
  const [settings, setSettings] = useState<CompanionSettings>(
    DEFAULT_COMPANION_SETTINGS,
  );

  useEffect(() => {
    let cancelled = false;
    void companionClient
      .getSettings()
      .then((loaded) => {
        if (!cancelled) setSettings(loaded);
      })
      .catch(() => {
        if (!cancelled) setSettings(DEFAULT_COMPANION_SETTINGS);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<CompanionSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      void companionClient.saveSettings(next).catch(() => undefined);
      return next;
    });
  }, []);

  return (
    <I18nProvider lang={settings.ui_language}>
      <CompanionApp settings={settings} onUpdateSettings={updateSettings} />
    </I18nProvider>
  );
}

function CompanionApp({
  settings,
  onUpdateSettings,
}: {
  settings: CompanionSettings;
  onUpdateSettings: (patch: Partial<CompanionSettings>) => void;
}) {
  const { lang, dir, categoryLabel, severityLabel, t } = useI18n();
  const [capture, setCapture] = useState<CaptureResult | null>(null);
  const [currentText, setCurrentText] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [llmSuggestStatus, setLlmSuggestStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [llmSuggestion, setLlmSuggestion] = useState<LlmSuggestion | null>(null);
  const [llmError, setLlmError] = useState<string | null>(null);
  const [llmRuntimeStatus, setLlmRuntimeStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [llmRuntimeReason, setLlmRuntimeReason] = useState<string | null>(null);
  const [llmDoctorStatus, setLlmDoctorStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [llmDoctorReport, setLlmDoctorReport] = useState<LlmDoctorReport | null>(
    null,
  );
  const [llmDoctorError, setLlmDoctorError] = useState<string | null>(null);
  const [llmConsentAccepted, setLlmConsentAccepted] = useState(false);
  const [llmValidatedSetup, setLlmValidatedSetup] = useState<string | null>(null);
  const llmRequestSeq = useRef(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeSuggestions = useMemo(
    () => suggestions.filter((suggestion) => !dismissed.has(suggestion.id)),
    [dismissed, suggestions],
  );
  const grouped = useMemo(
    () => groupByCategory(activeSuggestions),
    [activeSuggestions],
  );
  const safeCount = countSafe(activeSuggestions);
  const llmSetupSignature = [
    settings.llm_runtime_preset,
    settings.llm_base_url.trim(),
    settings.llm_model_id.trim(),
    settings.llm_timeout_ms,
  ].join("|");
  const selectedLlmPreset =
    LLM_RUNTIME_PRESETS.find(
      (preset) => preset.value === settings.llm_runtime_preset,
    ) ?? LLM_RUNTIME_PRESETS[0];
  const interfaceLanguageLabel =
    LANGS.find((option) => option.value === settings.ui_language)?.label ??
    settings.ui_language;
  const writingModeLabel =
    WRITING_MODES.find((option) => option.value === settings.writing_mode)
      ?.label[lang] ?? settings.writing_mode;
  const llmSetupReady =
    llmConsentAccepted && llmValidatedSetup === llmSetupSignature;

  const loadCapture = useCallback((result: CaptureResult) => {
    setCapture(result);
    setCurrentText(result.current_text);
    setSuggestions(result.analysis.suggestions);
    setDismissed(new Set());
    setStatus("ready");
    setLlmSuggestStatus("idle");
    setLlmSuggestion(null);
    setLlmError(null);
    setError(null);
    setNotice(captureNotice(result, lang));
  }, [lang]);

  const showError = useCallback((payload: CommandError | unknown) => {
    let message =
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : lang === "ar"
          ? "تعذّر تنفيذ العملية."
          : "The operation failed.";
    const category =
      typeof payload === "object" &&
      payload !== null &&
      "category" in payload &&
      typeof payload.category === "string"
        ? payload.category
        : null;
    if (category === "no_selected_text") {
      message =
        lang === "ar"
          ? "لم يكشف هذا التطبيق نصًا محددًا. حدد نصًا ثم اضغط الاختصار."
          : "This app did not expose selected text. Select text first, then press the hotkey.";
    } else if (category === "app_blocked_copy") {
      message =
        lang === "ar"
          ? "يبدو أن التطبيق منع نسخ التحديد. جرّب وضع الحافظة أولًا أو انسخ النص يدويًا."
          : "The source app did not copy the selection. Try Clipboard first mode or copy the text manually.";
    } else if (category === "clipboard_unavailable") {
      message =
        lang === "ar"
          ? "الحافظة غير متاحة الآن."
          : "Clipboard capture is unavailable right now.";
    } else if (category === "large_selection") {
      message =
        lang === "ar"
          ? "التحديد كبير جدًا. يرفض Nahou التحديدات الكبيرة افتراضيًا."
          : "The selection is too large. Nahou refuses large selections by default.";
    }
    setStatus("error");
    setError(message);
  }, [lang]);

  useEffect(() => {
    const listeners: Promise<UnlistenFn>[] = [
      listen<CaptureResult>("companion-captured", (event) =>
        loadCapture(event.payload),
      ),
      listen<CommandError>("companion-error", (event) =>
        showError(event.payload),
      ),
    ];
    return () => {
      for (const listener of listeners) {
        void listener.then((unlisten) => unlisten());
      }
    };
  }, [loadCapture, showError]);

  const checkSelection = useCallback(async () => {
    setStatus("loading");
    setError(null);
    setNotice(null);
    try {
      loadCapture(await companionClient.captureSelectedText());
    } catch (caught) {
      showError(caught);
    }
  }, [loadCapture, showError]);

  const refreshAnalysis = useCallback(
    async (text = currentText) => {
      if (!capture) return;
      try {
        const result = await companionClient.analyzeCapturedText(text);
        setCurrentText(result.current_text);
        setSuggestions(result.analysis.suggestions);
        setDismissed(new Set());
        setLlmSuggestion(null);
        setLlmSuggestStatus("idle");
        setLlmError(null);
        setNotice(lang === "ar" ? "حُدّث التحليل." : "Analysis refreshed.");
      } catch (caught) {
        showError(caught);
      }
    },
    [capture, currentText, lang, showError],
  );

  const applySafe = useCallback(async () => {
    if (safeCount === 0) return;
    setNotice(null);
    try {
      const outcome = await companionClient.applySafeToSession();
      setCurrentText(outcome.text);
      setSuggestions(outcome.remaining_suggestions);
      setDismissed(new Set());
      setNotice(
        lang === "ar"
          ? `طُبّقت ${outcome.applied_count} إصلاحات آمنة.`
          : `Applied ${outcome.applied_count} safe fixes.`,
      );
    } catch (caught) {
      showError(caught);
    }
  }, [lang, safeCount, showError]);

  const acceptSuggestion = useCallback(
    async (suggestion: Suggestion, replacement: string) => {
      try {
        const nextText = applySuggestionReplacement(
          currentText,
          suggestion,
          replacement,
        );
        setCurrentText(nextText);
        setNotice(lang === "ar" ? "قُبل الاقتراح." : "Suggestion accepted.");
        await refreshAnalysis(nextText);
      } catch {
        setNotice(
          lang === "ar"
            ? "تغيّر النص. أعد الفحص قبل تطبيق هذا الاقتراح."
            : "Text changed. Check again before applying this suggestion.",
        );
      }
    },
    [currentText, lang, refreshAnalysis],
  );

  const updatePreviewText = useCallback((text: string) => {
    setCurrentText(text);
    setSuggestions([]);
    setDismissed(new Set());
    setLlmSuggestion(null);
    setLlmSuggestStatus("idle");
    setLlmError(null);
  }, []);

  const checkLlmRuntime = useCallback(async () => {
    setLlmRuntimeStatus("loading");
    setLlmRuntimeReason(null);
    try {
      const status = await companionClient.getLlmStatus();
      setLlmRuntimeReason(status.reason);
      setLlmRuntimeStatus("done");
    } catch (caught) {
      const message =
        typeof caught === "object" &&
        caught !== null &&
        "message" in caught &&
        typeof caught.message === "string"
          ? caught.message
          : lang === "ar"
            ? "تعذّر فحص الخادم المحلي."
            : "Could not check the local runtime.";
      setLlmRuntimeReason(message);
      setLlmRuntimeStatus("error");
    }
  }, [lang]);

  const runLlmDoctor = useCallback(async () => {
    setLlmDoctorStatus("loading");
    setLlmDoctorReport(null);
    setLlmDoctorError(null);
    try {
      const report = await companionClient.runLlmDoctor();
      setLlmDoctorReport(report);
      setLlmValidatedSetup(report.ok && report.available ? llmSetupSignature : null);
      setLlmDoctorStatus("done");
    } catch (caught) {
      setLlmValidatedSetup(null);
      const message =
        typeof caught === "object" &&
        caught !== null &&
        "message" in caught &&
        typeof caught.message === "string"
          ? caught.message
          : lang === "ar"
            ? "تعذّر تشغيل فحص النموذج المحلي."
            : "Could not run the local LLM doctor.";
      setLlmDoctorError(message);
      setLlmDoctorStatus("error");
    }
  }, [lang, llmSetupSignature]);

  const requestLlmSuggestion = useCallback(async () => {
    if (!capture || !currentText.trim()) return;
    if (!llmSetupReady) {
      setNotice(
        lang === "ar"
          ? "أكمل إعداد النموذج المحلي وشغّل التشخيص قبل طلب اقتراح LLM."
          : "Complete local LLM setup and run doctor before requesting an LLM suggestion.",
      );
      return;
    }
    const requestId = llmRequestSeq.current + 1;
    llmRequestSeq.current = requestId;
    setLlmSuggestStatus("loading");
    setLlmSuggestion(null);
    setLlmError(null);
    setNotice(null);
    try {
      const suggestion = await companionClient.suggestWithLocalLlmForSession();
      if (llmRequestSeq.current !== requestId) return;
      setLlmSuggestion(suggestion);
      setLlmSuggestStatus("done");
    } catch (caught) {
      if (llmRequestSeq.current !== requestId) return;
      const message =
        typeof caught === "object" &&
        caught !== null &&
        "message" in caught &&
        typeof caught.message === "string"
          ? caught.message
          : lang === "ar"
            ? "تعذّر إنشاء اقتراح من النموذج المحلي."
            : "Could not create a local LLM suggestion.";
      if (message.toLocaleLowerCase().includes("cancel")) {
        setLlmSuggestStatus("idle");
        setNotice(t("llmCancelled"));
        return;
      }
      setLlmError(message);
      setLlmSuggestStatus("error");
    }
  }, [capture, currentText, lang, llmSetupReady, t]);

  const cancelLlmSuggestion = useCallback(async () => {
    if (llmSuggestStatus !== "loading") return;
    llmRequestSeq.current += 1;
    setLlmSuggestStatus("idle");
    setLlmSuggestion(null);
    setLlmError(null);
    setNotice(t("llmCancelled"));
    try {
      await companionClient.cancelLocalLlmSuggestion();
    } catch {
      // Cancellation is best-effort; stale request results are ignored by request id.
    }
  }, [llmSuggestStatus, t]);

  const applyLlmSuggestion = useCallback(
    (replacement: string) => {
      setCurrentText(replacement);
      setSuggestions([]);
      setDismissed(new Set());
      setNotice(
        lang === "ar"
          ? "طُبّق اقتراح النموذج المحلي يدويًا."
          : "Applied the local LLM suggestion manually.",
      );
    },
    [lang],
  );

  const replaceSelection = useCallback(async () => {
    if (!capture || currentText === capture.captured_text) return;
    try {
      const result = await companionClient.applyReplacementToSelection(currentText);
      setNotice(
        result.restore_warning ??
          (lang === "ar"
            ? "استُبدل النص المحدد في التطبيق السابق."
            : "Replaced the selection in the previous app."),
      );
    } catch (caught) {
      showError(caught);
    }
  }, [capture, currentText, lang, showError]);

  const copyCorrectedText = useCallback(async () => {
    try {
      await companionClient.copyCorrectedText(currentText);
      setNotice(lang === "ar" ? "نُسخ النص المصحح." : "Corrected text copied.");
    } catch (caught) {
      showError(caught);
    }
  }, [currentText, lang, showError]);

  const reportSuggestion = useCallback(
    async (suggestion: Suggestion) => {
      const report = buildPrivacySafeSuggestionReport({
        appVersion: __ALFARAHEEDI_APP_VERSION__,
        suggestion,
        sourceApp: capture?.source_app ?? null,
      });
      try {
        await companionClient.copyCorrectedText(report);
        setNotice(
          lang === "ar"
            ? "نُسخ تقرير الاقتراح بدون النص الخام."
            : "Suggestion report copied without raw text.",
        );
      } catch (caught) {
        showError(caught);
      }
    },
    [capture?.source_app, lang, showError],
  );

  return (
    <div className="app companion-app" dir={dir}>
      <main className="companion-shell">
        <section className="companion-hero">
          <div>
            <p className="companion-kicker">
              {lang === "ar" ? "مراجعة النص المحدد" : "Review selected text"}
            </p>
            <h1>{t("brandName")}</h1>
            <p>
              {lang === "ar"
                ? `حدد نصًا في تطبيق مدعوم واضغط ${settings.hotkey}.`
                : `Select text in a supported app and press ${settings.hotkey}.`}
            </p>
          </div>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void checkSelection()}
            disabled={status === "loading"}
          >
            <ScanIcon />
            {status === "loading"
              ? lang === "ar"
                ? "جارٍ الفحص..."
                : "Checking..."
              : lang === "ar"
                ? "فحص النص المحدد"
                : "Check selected text"}
          </button>
        </section>

        {!settings.first_run_privacy_seen && (
          <section className="companion-privacy" role="status">
            <ShieldIcon />
            <p>
              {lang === "ar"
                ? "يعالج Nahou النص المحدد محليًا فقط بعد الاختصار أو الإجراء اليدوي. لا توجد خدمة مستضافة أو تتبع، ولا نخزن النص الملتقط افتراضيًا. تُستخدم الحافظة بعد الإجراء فقط وتُستعاد عند الإمكان. اقتراحات LLM تتطلب إعداد مشغل محلي منفصل."
                : "Nahou processes selected text locally only after the hotkey or manual action. There is no hosted service or telemetry, and captured text is not stored by default. The clipboard is used only after the action and restored when possible. LLM suggestions require separate local runtime configuration."}
            </p>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => onUpdateSettings({ first_run_privacy_seen: true })}
            >
              {lang === "ar" ? "فهمت" : "Got it"}
            </button>
          </section>
        )}

        <section className="companion-controls" aria-label="Companion settings">
          <fieldset className="field">
            <legend className="field__label">
              {lang === "ar" ? "لغة الواجهة" : "Interface language"}
            </legend>
            <div className="segmented">
              {LANGS.map((option) => (
                <label
                  key={option.value}
                  className={`segmented__option${
                    settings.ui_language === option.value ? " is-selected" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="companion-language"
                    checked={settings.ui_language === option.value}
                    onChange={() => onUpdateSettings({ ui_language: option.value })}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="field">
            <legend className="field__label">
              {lang === "ar" ? "لغة الكتابة" : "Writing mode"}
            </legend>
            <div className="segmented">
              {WRITING_MODES.map((option) => (
                <label
                  key={option.value}
                  className={`segmented__option${
                    settings.writing_mode === option.value ? " is-selected" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="writing-mode"
                    checked={settings.writing_mode === option.value}
                    onChange={() =>
                      onUpdateSettings({ writing_mode: option.value })
                    }
                  />
                  {option.label[lang]}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="field">
            <legend className="field__label">
              {lang === "ar" ? "ترتيب الالتقاط" : "Capture order"}
            </legend>
            <div className="segmented">
              {CAPTURE_PREFERENCES.map((option) => (
                <label
                  key={option.value}
                  className={`segmented__option${
                    settings.capture_preference === option.value ? " is-selected" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="capture-preference"
                    checked={settings.capture_preference === option.value}
                    onChange={() =>
                      onUpdateSettings({ capture_preference: option.value })
                    }
                  />
                  {option.label[lang]}
                </label>
              ))}
            </div>
            <p className="field__hint">
              {lang === "ar"
                ? "إذا كان الاختصار مستخدمًا في تطبيق آخر، افتح Nahou من النافذة أو علبة النظام ثم اختر فحص النص المحدد."
                : "If another app already uses the hotkey, open Nahou from the window or tray and choose Check selected text."}
            </p>
          </fieldset>

          <fieldset className="field companion-llm-settings">
            <legend className="field__label">
              {lang === "ar" ? "النموذج المحلي" : "Local LLM"}
            </legend>
            <div className="companion-llm-grid">
              <label className="field companion-field">
                <span className="field__label">
                  {lang === "ar" ? "مسار التشغيل" : "Runtime preset"}
                </span>
                <select
                  className="field__input"
                  value={settings.llm_runtime_preset}
                  onChange={(event) =>
                    onUpdateSettings({
                      llm_runtime_preset: event.target.value as LlmRuntimePreset,
                    })
                  }
                >
                  {LLM_RUNTIME_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label[lang]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field companion-field">
                <span className="field__label">
                  {lang === "ar" ? "عنوان الخادم المحلي" : "Local runtime URL"}
                </span>
                <input
                  className="field__input"
                  dir="ltr"
                  type="url"
                  inputMode="url"
                  value={settings.llm_base_url}
                  onChange={(event) =>
                    onUpdateSettings({ llm_base_url: event.target.value })
                  }
                  placeholder="http://127.0.0.1:8000"
                />
              </label>
              <label className="field companion-field">
                <span className="field__label">
                  {lang === "ar" ? "معرّف النموذج" : "Model id"}
                </span>
                <input
                  className="field__input"
                  dir="ltr"
                  type="text"
                  value={settings.llm_model_id}
                  onChange={(event) =>
                    onUpdateSettings({ llm_model_id: event.target.value })
                  }
                />
              </label>
              <label className="field companion-field">
                <span className="field__label">
                  {lang === "ar" ? "المهلة بالمللي ثانية" : "Timeout milliseconds"}
                </span>
                <input
                  className="field__input"
                  dir="ltr"
                  type="number"
                  min={1_000}
                  max={120_000}
                  step={1_000}
                  value={settings.llm_timeout_ms}
                  onChange={(event) =>
                    onUpdateSettings({
                      llm_timeout_ms:
                        Number.parseInt(event.target.value, 10) ||
                        DEFAULT_COMPANION_SETTINGS.llm_timeout_ms,
                    })
                  }
                />
              </label>
            </div>
            <p className="field__hint">{selectedLlmPreset.hint[lang]}</p>
            <label className="field companion-field companion-llm-consent">
              <input
                type="checkbox"
                checked={llmConsentAccepted}
                onChange={(event) => setLlmConsentAccepted(event.target.checked)}
              />
              <span>{LOCAL_LLM_CONSENT}</span>
            </label>
            <div className="companion-llm-actions">
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => void checkLlmRuntime()}
                disabled={llmRuntimeStatus === "loading"}
              >
                {llmRuntimeStatus === "loading"
                  ? lang === "ar"
                    ? "جارٍ الفحص..."
                    : "Checking..."
                  : lang === "ar"
                    ? "فحص الخادم"
                    : "Check runtime"}
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => void runLlmDoctor()}
                disabled={llmDoctorStatus === "loading"}
              >
                {llmDoctorStatus === "loading"
                  ? lang === "ar"
                    ? "جارٍ التشخيص..."
                    : "Running doctor..."
                  : lang === "ar"
                    ? "تشخيص النموذج"
                    : "Run doctor"}
              </button>
              {llmRuntimeReason && (
                <p
                  className={`policy-note companion-llm-status${
                    llmRuntimeStatus === "error" ? " is-error" : ""
                  }`}
                  role={llmRuntimeStatus === "error" ? "alert" : "status"}
                >
                  {llmRuntimeReason}
                </p>
              )}
              {!llmSetupReady && (
                <p className="policy-note companion-llm-status" role="status">
                  {lang === "ar"
                    ? "يبقى زر LLM خلف الإعداد حتى تقبل إرسال النص المحدد إلى خادمك المحلي ويجتاز التشخيص."
                    : "The LLM action stays behind setup until you consent to sending selected text to your local runtime and the doctor passes."}
                </p>
              )}
            </div>
            {llmDoctorStatus === "error" && (
              <div className="state state--error companion-llm-doctor" role="alert">
                {llmDoctorError ??
                  (lang === "ar"
                    ? "تعذّر تشغيل فحص النموذج المحلي."
                    : "Could not run the local LLM doctor.")}
              </div>
            )}
            {llmDoctorReport && (
              <article
                className="companion-llm-doctor"
                data-testid="companion-llm-doctor"
              >
                <header className="companion-llm-doctor__header">
                  <div>
                    <h3>{lang === "ar" ? "تشخيص النموذج المحلي" : "Runtime doctor"}</h3>
                    <p className="policy-note">{llmDoctorReport.summary}</p>
                  </div>
                  <span
                    className={`badge ${
                      llmDoctorReport.ok ? "badge--safe" : "badge--suggest"
                    }`}
                  >
                    {llmDoctorReport.ok
                      ? lang === "ar"
                        ? "سليم"
                        : "OK"
                      : lang === "ar"
                        ? "مشكلة"
                        : "Needs attention"}
                  </span>
                </header>
                <ul className="companion-llm-doctor__checks">
                  {llmDoctorReport.checks.map((check) => (
                    <li key={`${check.name}:${check.outcome}`}>
                      <span
                        className={`doctor-outcome doctor-outcome--${check.outcome}`}
                      >
                        {doctorOutcomeLabel(check.outcome, lang)}
                      </span>
                      <code dir="ltr">{check.name}</code>
                      <span>{check.message}</span>
                    </li>
                  ))}
                </ul>
              </article>
            )}
          </fieldset>
        </section>

        {error && (
          <div className="state state--error" role="alert">
            {error}
          </div>
        )}

        {notice && (
          <div className="notice companion-notice" role="status">
            {notice}
          </div>
        )}

        {!capture && status !== "error" && (
          <section className="state state--empty companion-empty">
            <p>
              {lang === "ar"
                ? "لا توجد جلسة بعد. حدد نصًا في تطبيق آخر ثم استخدم الاختصار."
                : "No session yet. Select text in another app, then use the hotkey."}
            </p>
          </section>
        )}

        {capture && (
          <section className="companion-review">
            <header className="companion-review__header">
              <div>
                <h2>{lang === "ar" ? "مراجعة النص المحدد" : "Review selection"}</h2>
                <p className="muted">
                  {capture.source_app ?? (lang === "ar" ? "تطبيق غير معروف" : "Unknown app")} ·{" "}
                  {[...capture.captured_text].length} {t("charCount")} ·{" "}
                  {captureMethodLabel(capture.capture_method, lang)}
                </p>
                <dl
                  className="companion-review__meta"
                  aria-label="Review context"
                  data-testid="companion-review-context"
                >
                  <div>
                    <dt>{lang === "ar" ? "لغة الواجهة" : "Interface language"}</dt>
                    <dd>{interfaceLanguageLabel}</dd>
                  </div>
                  <div>
                    <dt>{lang === "ar" ? "وضع الكتابة" : "Writing mode"}</dt>
                    <dd>{writingModeLabel}</dd>
                  </div>
                  <div>
                    <dt>{lang === "ar" ? "طريقة الالتقاط" : "Capture method"}</dt>
                    <dd>{captureMethodLabel(capture.capture_method, lang)}</dd>
                  </div>
                </dl>
              </div>
              <div className="companion-review__actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => void applySafe()}
                  disabled={safeCount === 0}
                >
                  <CheckIcon />
                  {t("applySafe")}
                  {safeCount > 0 && <span className="btn__count">{safeCount}</span>}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void copyCorrectedText()}
                >
                  <CopyIcon />
                  {lang === "ar" ? "نسخ النص المصحح" : "Copy Corrected Text"}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void refreshAnalysis()}
                  disabled={!currentText.trim()}
                >
                  {lang === "ar" ? "تحديث التحليل" : "Refresh analysis"}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void requestLlmSuggestion()}
                  disabled={
                    llmSuggestStatus === "loading" ||
                    !currentText.trim() ||
                    !llmSetupReady
                  }
                >
                  {llmSuggestStatus === "loading"
                    ? t("llmSuggesting")
                    : t("llmSuggest")}
                </button>
                {llmSuggestStatus === "loading" && (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => void cancelLlmSuggestion()}
                  >
                    {t("llmCancelSuggestion")}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void replaceSelection()}
                  disabled={currentText === capture.captured_text}
                >
                  {lang === "ar" ? "استبدال التحديد" : "Replace Selection"}
                </button>
              </div>
            </header>

            <textarea
              className="companion-preview"
              dir="auto"
              value={currentText}
              onChange={(event) => updatePreviewText(event.target.value)}
              aria-label={lang === "ar" ? "معاينة النص المصحح" : "Corrected text preview"}
            />

            {llmSuggestStatus === "loading" && (
              <div className="state state--loading companion-llm-progress" role="status">
                <p>{t("llmSuggesting")}</p>
                <p className="state__detail">{t("llmSuggestProgress")}</p>
              </div>
            )}

            {llmSuggestStatus === "error" && (
              <div className="state state--error" role="alert">
                <p>{t("llmSuggestionFailed")}</p>
                {llmError && <p className="state__detail">{llmError}</p>}
                <p className="state__detail">{t("llmPolicyNote")}</p>
              </div>
            )}

            {llmSuggestStatus === "done" && llmSuggestion && (
              <article
                className="llm-suggestion companion-llm-suggestion"
                data-testid="companion-llm-suggestion"
              >
                <header className="llm-suggestion__header">
                  <div>
                    <h3>{t("llmSuggestionTitle")}</h3>
                    <p className="muted" dir="ltr">
                      {llmSuggestion.source} · {llmSuggestion.model_id} ·{" "}
                      {llmSuggestion.category}
                    </p>
                  </div>
                  <span className="badge badge--suggest">{t("badgeSuggest")}</span>
                </header>
                <p className="llm-suggestion__explanation">
                  {llmSuggestion.explanation}
                </p>
                <div className="llm-suggestion__replacement" dir="auto">
                  {llmSuggestion.replacement}
                </div>
                <footer className="llm-suggestion__footer">
                  <span className="muted">
                    {t("confidence")} {(llmSuggestion.confidence * 100).toFixed(0)}%
                  </span>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => applyLlmSuggestion(llmSuggestion.replacement)}
                  >
                    {t("llmApplySuggestion")}
                  </button>
                </footer>
              </article>
            )}

            <div className="companion-suggestions">
              {activeSuggestions.length === 0 ? (
                <div className="state state--empty">
                  {lang === "ar"
                    ? "لا توجد اقتراحات نشطة."
                    : "No active suggestions."}
                </div>
              ) : (
                grouped.map((group) => (
                  <section key={group.category} className="suggestion-group">
                    <h3 className="suggestion-group__title">
                      {categoryLabel(group.category)}
                      <span className="suggestion-group__count">
                        {group.suggestions.length}
                      </span>
                    </h3>
                    {group.suggestions.map((suggestion) => (
                      <CompanionSuggestionCard
                        key={suggestion.id}
                        suggestion={suggestion}
                        severityLabel={severityLabel(suggestion.severity)}
                        onAccept={acceptSuggestion}
                        onDismiss={(id) =>
                          setDismissed((items) => new Set(items).add(id))
                        }
                        onReport={reportSuggestion}
                      />
                    ))}
                  </section>
                ))
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function doctorOutcomeLabel(outcome: LlmDoctorOutcome, lang: "ar" | "en"): string {
  if (lang === "ar") {
    switch (outcome) {
      case "pass":
        return "نجح";
      case "warn":
        return "تنبيه";
      case "fail":
        return "فشل";
      case "skip":
        return "تخطّي";
    }
  }
  return outcome;
}

function CompanionSuggestionCard({
  suggestion,
  severityLabel,
  onAccept,
  onDismiss,
  onReport,
}: {
  suggestion: Suggestion;
  severityLabel: string;
  onAccept: (suggestion: Suggestion, replacement: string) => void;
  onDismiss: (id: string) => void;
  onReport: (suggestion: Suggestion) => void;
}) {
  const { lang, t, ruleText } = useI18n();
  const replacement = suggestion.replacements[0] ?? "";
  return (
    <article className="suggestion companion-card" data-testid="companion-suggestion">
      <header className="suggestion__head companion-card__head">
        <span className={`sev sev--${suggestion.severity.toLowerCase()}`}>
          {severityLabel}
        </span>
        <code className="suggestion__source" dir="ltr">
          {suggestion.source}
        </code>
        <span
          className={`badge ${
            suggestion.safe_auto_apply ? "badge--safe" : "badge--suggest"
          }`}
        >
          {suggestion.safe_auto_apply ? t("badgeSafe") : t("badgeSuggest")}
        </span>
      </header>
      <p className="suggestion__explanation">
        {ruleText(suggestion.source, suggestion.explanation)}
      </p>
      <div className="suggestion__diff">
        <span className="suggestion__original" dir="auto">
          {renderReplacement(suggestion.original, t("deleteToken"))}
        </span>
        <span className="suggestion__arrow" aria-hidden="true">
          ←
        </span>
        <span className="suggestion__replacements" dir="auto">
          {renderReplacement(replacement, t("deleteToken"))}
        </span>
      </div>
      <footer className="suggestion__meta companion-card__actions">
        <button
          type="button"
          className="btn btn--primary btn--small"
          onClick={() => onAccept(suggestion, replacement)}
          disabled={suggestion.replacements.length === 0}
        >
          {lang === "ar" ? "قبول" : "Accept"}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => onDismiss(suggestion.id)}
        >
          {lang === "ar" ? "تجاهل" : "Dismiss"}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => void onReport(suggestion)}
        >
          {t("reportSuggestion")}
        </button>
      </footer>
    </article>
  );
}
