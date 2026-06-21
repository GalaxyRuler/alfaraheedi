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
  type CaptureResult,
  type CommandError,
  type CompanionSettings,
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
    setNotice(result.restore_warning);
  }, []);

  const showError = useCallback((payload: CommandError | unknown) => {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : lang === "ar"
          ? "تعذّر تنفيذ العملية."
          : "The operation failed.";
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
      setLlmDoctorStatus("done");
    } catch (caught) {
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
  }, [lang]);

  const requestLlmSuggestion = useCallback(async () => {
    if (!capture || !currentText.trim()) return;
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
  }, [capture, currentText, lang, t]);

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
              {lang === "ar" ? "مرافق كتابة شامل" : "Universal writing companion"}
            </p>
            <h1>{t("brandName")}</h1>
            <p>
              {lang === "ar"
                ? `حدد نصًا في أي تطبيق واضغط ${settings.hotkey}.`
                : `Select text in any app and press ${settings.hotkey}.`}
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
                ? "ينسخ الفراهيدي النص المحدد محليًا فقط بعد الاختصار. لا توجد خدمة مستضافة أو تتبع، وتُستعاد الحافظة عند الإمكان."
                : "Alfaraheedi copies selected text locally only after the hotkey. There is no hosted service or telemetry, and the clipboard is restored when possible."}
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

          <fieldset className="field companion-llm-settings">
            <legend className="field__label">
              {lang === "ar" ? "النموذج المحلي" : "Local LLM"}
            </legend>
            <div className="companion-llm-grid">
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
                  {[...capture.captured_text].length} {t("charCount")}
                </p>
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
                  {lang === "ar" ? "نسخ المصحح" : "Copy corrected"}
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
                  disabled={llmSuggestStatus === "loading" || !currentText.trim()}
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
                  {lang === "ar" ? "استبدال المحدد" : "Replace selection"}
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
                      {llmSuggestion.source} · {llmSuggestion.model_id}
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
