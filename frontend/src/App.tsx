import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, createApi } from "./api/client";
import type { LlmStatus, LlmSuggestion, RuleInfo, Suggestion } from "./api/types";
import {
  clearDraft,
  loadDraft,
  saveDraft,
  type Settings,
  useSettings,
} from "./state/settings";
import { countSafe } from "./lib/format";
import { I18nProvider, useI18n } from "./i18n/i18n";
import type { Lang } from "./i18n/strings";
import { Editor } from "./components/Editor";
import { Header, type Health } from "./components/Header";
import { Toolbar } from "./components/Toolbar";
import {
  SuggestionsPanel,
  type AnalyzeStatus,
  type LlmSuggestStatus,
} from "./components/SuggestionsPanel";
import { Drawer } from "./components/Drawer";
import { RulesPanel, type LoadStatus } from "./components/RulesPanel";
import { LlmPanel } from "./components/LlmPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { ReportPanel } from "./components/ReportPanel";
import { ShieldIcon } from "./components/Icons";
import {
  safeApiOrigin,
  type EditorSelection,
  type FeedbackReportEnvironment,
  type FeedbackReportTarget,
} from "./lib/feedbackReport";

const EXAMPLE_TEXT = "مرحبــا  بالعالم، كيف حالك? أنا بخير, شكرًا ؛";

type DrawerName = "rules" | "llm" | "settings" | "report" | null;

function errorMessage(error: unknown, lang: Lang): string {
  if (error instanceof ApiError) return error.message;
  return lang === "ar" ? "حدث خطأ غير متوقع." : "An unexpected error occurred.";
}

function isUnavailable(error: unknown): boolean {
  return error instanceof ApiError && (error.kind === "network" || error.kind === "timeout");
}

// Apply a single replacement client-side using UTF-16 offsets (which match
// JS string indices). Used for suggest-only items the server never auto-applies.
function spliceReplacement(text: string, suggestion: Suggestion, replacement: string): string {
  const { start_utf16, end_utf16 } = suggestion.span;
  return text.slice(0, start_utf16) + replacement + text.slice(end_utf16);
}

function selectionFromSuggestion(text: string, suggestion: Suggestion): EditorSelection {
  const start = Math.max(0, Math.min(suggestion.span.start_utf16, text.length));
  const end = Math.max(start, Math.min(suggestion.span.end_utf16, text.length));
  return {
    start_utf16: start,
    end_utf16: end,
    text: text.slice(start, end),
  };
}

export default function App() {
  const { settings, update } = useSettings();
  return (
    <I18nProvider lang={settings.language}>
      <Workbench settings={settings} update={update} />
    </I18nProvider>
  );
}

function Workbench({
  settings,
  update,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}) {
  const { t, lang, dir } = useI18n();
  const api = useMemo(() => createApi(settings.apiBaseUrl), [settings.apiBaseUrl]);

  const [text, setText] = useState<string>(() =>
    settings.rememberDraft ? loadDraft() : "",
  );
  const textRef = useRef(text);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [analyzeStatus, setAnalyzeStatus] = useState<AnalyzeStatus>("idle");
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [llmSuggestStatus, setLlmSuggestStatus] =
    useState<LlmSuggestStatus>("idle");
  const [llmSuggestion, setLlmSuggestion] = useState<LlmSuggestion | null>(null);
  const [llmSuggestError, setLlmSuggestError] = useState<string | null>(null);

  const [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [health, setHealth] = useState<Health>("checking");
  const [drawer, setDrawer] = useState<DrawerName>(null);
  const [editorSelection, setEditorSelection] = useState<EditorSelection | null>(
    null,
  );
  const [reportTarget, setReportTarget] =
    useState<FeedbackReportTarget | null>(null);
  const [reportEnvironment, setReportEnvironment] =
    useState<FeedbackReportEnvironment | null>(null);

  const [rules, setRules] = useState<RuleInfo[]>([]);
  const [rulesStatus, setRulesStatus] = useState<LoadStatus>("idle");
  const [rulesError, setRulesError] = useState<string | null>(null);

  const [llm, setLlm] = useState<LlmStatus | null>(null);
  const [llmStatus, setLlmStatus] = useState<LoadStatus>("idle");
  const [llmError, setLlmError] = useState<string | null>(null);

  const commitText = useCallback((next: string) => {
    textRef.current = next;
    setText(next);
  }, []);

  const createReportEnvironment = useCallback(
    (): FeedbackReportEnvironment => ({
      ui_language: lang,
      editor_direction: settings.direction,
      api_origin: safeApiOrigin(settings.apiBaseUrl),
      browser_language: navigator.language || "unknown",
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      online: navigator.onLine,
    }),
    [lang, settings.apiBaseUrl, settings.direction],
  );

  const handleEditorChange = useCallback((next: string) => {
    if (next === textRef.current) return;
    textRef.current = next;
    setText(next);
    setSuggestions([]);
    setActiveId(null);
    setAnalyzeStatus("idle");
    setAnalyzeError(null);
    setLlmSuggestStatus("idle");
    setLlmSuggestion(null);
    setLlmSuggestError(null);
    setNotice(null);
    setEditorSelection(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setHealth("checking");
    const check = async () => {
      try {
        await api.health();
        if (!cancelled) setHealth("online");
      } catch {
        if (!cancelled) setHealth("offline");
      }
    };
    void check();
    const id = setInterval(() => void check(), 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [api]);

  useEffect(() => {
    if (settings.rememberDraft) saveDraft(text);
  }, [text, settings.rememberDraft]);
  useEffect(() => {
    if (!settings.rememberDraft) clearDraft();
  }, [settings.rememberDraft]);

  const runAnalyze = useCallback(
    async (input: string) => {
      if (!input.trim()) return;
      setAnalyzeStatus("loading");
      setAnalyzeError(null);
      setNotice(null);
      try {
        const analysis = await api.analyze(input);
        setSuggestions(analysis.suggestions);
        setActiveId(null);
        setAnalyzeStatus("done");
      } catch (error) {
        setAnalyzeStatus("error");
        setAnalyzeError(errorMessage(error, lang));
        if (isUnavailable(error)) setHealth("offline");
      }
    },
    [api, lang],
  );

  const handleAnalyze = useCallback(() => void runAnalyze(text), [runAnalyze, text]);

  const handleApplySafe = useCallback(async () => {
    if (countSafe(suggestions) === 0) return;
    setApplying(true);
    setNotice(null);
    try {
      const outcome = await api.applySafe(text);
      commitText(outcome.text);
      setSuggestions(outcome.remaining_suggestions);
      setActiveId(null);
      setLlmSuggestStatus("idle");
      setLlmSuggestion(null);
      setLlmSuggestError(null);
      setAnalyzeStatus("done");
      setNotice(
        lang === "ar"
          ? `طُبّقت ${outcome.applied_count} إصلاحات آمنة، وتُرك ${outcome.skipped_count} اقتراحًا.`
          : `Applied ${outcome.applied_count} safe fixes, kept ${outcome.skipped_count} suggestions.`,
      );
    } catch (error) {
      setNotice(
        (lang === "ar" ? "تعذّر التطبيق: " : "Apply failed: ") +
          errorMessage(error, lang),
      );
      if (isUnavailable(error)) setHealth("offline");
    } finally {
      setApplying(false);
    }
  }, [api, suggestions, text, commitText, lang]);

  const handleApplyOne = useCallback(
    (suggestion: Suggestion, replacement: string) => {
      const next = spliceReplacement(textRef.current, suggestion, replacement);
      commitText(next);
      setActiveId(null);
      setLlmSuggestStatus("idle");
      setLlmSuggestion(null);
      setLlmSuggestError(null);
      void runAnalyze(next);
    },
    [commitText, runAnalyze],
  );

  const handleLlmSuggest = useCallback(async () => {
    if (!text.trim()) return;
    setLlmSuggestStatus("loading");
    setLlmSuggestError(null);
    setLlmSuggestion(null);
    setNotice(null);
    try {
      setLlmSuggestion(await api.llmSuggest(text));
      setLlmSuggestStatus("done");
    } catch (error) {
      setLlmSuggestStatus("error");
      setLlmSuggestError(errorMessage(error, lang));
      if (isUnavailable(error)) setHealth("offline");
    }
  }, [api, lang, text]);

  const handleApplyLlmSuggestion = useCallback(
    (replacement: string) => {
      commitText(replacement);
      setLlmSuggestStatus("idle");
      setLlmSuggestion(null);
      setLlmSuggestError(null);
      setSuggestions([]);
      setActiveId(null);
      setAnalyzeStatus("idle");
      setNotice(
        lang === "ar"
          ? "طُبّق اقتراح النموذج المحلي يدويًا."
          : "Applied the local LLM suggestion manually.",
      );
    },
    [commitText, lang],
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setNotice(
        lang === "ar" ? "تعذّر النسخ إلى الحافظة." : "Could not copy to clipboard.",
      );
    }
  }, [text, lang]);

  const handleLoadExample = useCallback(() => {
    commitText(EXAMPLE_TEXT);
    setSuggestions([]);
    setAnalyzeStatus("idle");
    setLlmSuggestStatus("idle");
    setLlmSuggestion(null);
    setLlmSuggestError(null);
    setNotice(null);
  }, [commitText]);

  const handleClear = useCallback(() => {
    commitText("");
    setSuggestions([]);
    setActiveId(null);
    setAnalyzeStatus("idle");
    setLlmSuggestStatus("idle");
    setLlmSuggestion(null);
    setLlmSuggestError(null);
    setNotice(null);
    setEditorSelection(null);
  }, [commitText]);

  const loadRules = useCallback(async () => {
    setRulesStatus("loading");
    setRulesError(null);
    try {
      setRules(await api.rules());
      setRulesStatus("done");
    } catch (error) {
      setRulesStatus("error");
      setRulesError(errorMessage(error, lang));
    }
  }, [api, lang]);

  const loadLlm = useCallback(async () => {
    setLlmStatus("loading");
    setLlmError(null);
    try {
      setLlm(await api.llmStatus());
      setLlmStatus("done");
    } catch (error) {
      setLlmStatus("error");
      setLlmError(errorMessage(error, lang));
    }
  }, [api, lang]);

  const openRules = useCallback(() => {
    setDrawer("rules");
    void loadRules();
  }, [loadRules]);
  const openLlm = useCallback(() => {
    setDrawer("llm");
    void loadLlm();
  }, [loadLlm]);

  const openReport = useCallback(
    (target: FeedbackReportTarget) => {
      setReportTarget(target);
      setReportEnvironment(createReportEnvironment());
      setDrawer("report");
    },
    [createReportEnvironment],
  );

  const handleReportAnalysis = useCallback(() => {
    openReport({
      kind: "analysis",
      text: textRef.current,
      suggestions,
      selectedText: editorSelection,
    });
  }, [editorSelection, openReport, suggestions]);

  const handleReportSuggestion = useCallback(
    (suggestion: Suggestion) => {
      const currentText = textRef.current;
      openReport({
        kind: "suggestion",
        text: currentText,
        suggestions,
        selectedText: selectionFromSuggestion(currentText, suggestion),
        suggestion,
      });
    },
    [openReport, suggestions],
  );

  const safeCount = countSafe(suggestions);

  return (
    <div className="app" dir={dir}>
      <a className="skip-link" href="#editor-workspace">
        {t("skipEditor")}
      </a>
      <Header
        health={health}
        apiBaseUrl={settings.apiBaseUrl}
        onOpenRules={openRules}
        onOpenLlm={openLlm}
        onOpenSettings={() => setDrawer("settings")}
      />

      {health === "offline" && (
        <div className="banner banner--warn" role="alert">
          <span>
            {lang === "ar"
              ? "تعذّر الوصول إلى المحرك على "
              : "Can't reach the engine at "}
            <code dir="ltr">{settings.apiBaseUrl}</code>.{" "}
            {lang === "ar" ? "شغّل الخادم: " : "Start the server: "}
            <code dir="ltr">cargo run -p write-cli -- serve</code>
          </span>
          <button type="button" className="btn btn--ghost" onClick={handleAnalyze}>
            {t("retry")}
          </button>
        </div>
      )}

      <main className="workbench" id="editor-workspace" tabIndex={-1}>
        <section className="editor-column">
          <Toolbar
            onAnalyze={handleAnalyze}
            onApplySafe={() => void handleApplySafe()}
            onLlmSuggest={() => void handleLlmSuggest()}
            onCopy={() => void handleCopy()}
            onLoadExample={handleLoadExample}
            onClear={handleClear}
            analyzing={analyzeStatus === "loading"}
            applying={applying}
            llmSuggesting={llmSuggestStatus === "loading"}
            hasText={text.length > 0}
            safeCount={safeCount}
            copied={copied}
          />

          <Editor
            key={lang}
            value={text}
            onChange={handleEditorChange}
            direction={settings.direction}
            placeholderText={t("editorPlaceholder")}
            ariaLabel={t("editorAria")}
            suggestions={suggestions}
            activeId={activeId}
            onActivate={setActiveId}
            onSelectionChange={setEditorSelection}
          />

          <footer className="editor-foot">
            <span className="privacy">
              <ShieldIcon size={14} />
              {t("privacyLocal")}
            </span>
            <span className="muted" data-testid="char-count">
              {[...text].length} {t("charCount")}
            </span>
            {notice && (
              <span className="notice" role="status" data-testid="notice">
                {notice}
              </span>
            )}
          </footer>
        </section>

        <SuggestionsPanel
          status={analyzeStatus}
          suggestions={suggestions}
          llmStatus={llmSuggestStatus}
          llmSuggestion={llmSuggestion}
          llmErrorMessage={llmSuggestError}
          activeId={activeId}
          errorMessage={analyzeError}
          onActivate={setActiveId}
          onApply={handleApplyOne}
          onApplyLlmSuggestion={handleApplyLlmSuggestion}
          onReportAnalysis={handleReportAnalysis}
          onReportSuggestion={handleReportSuggestion}
        />
      </main>

      <Drawer open={drawer === "rules"} title={t("navRules")} onClose={() => setDrawer(null)}>
        <RulesPanel
          status={rulesStatus}
          rules={rules}
          errorMessage={rulesError}
          onReload={() => void loadRules()}
        />
      </Drawer>

      <Drawer open={drawer === "llm"} title={t("navLlm")} onClose={() => setDrawer(null)}>
        <LlmPanel
          status={llmStatus}
          data={llm}
          errorMessage={llmError}
          onReload={() => void loadLlm()}
        />
      </Drawer>

      <Drawer open={drawer === "settings"} title={t("navSettings")} onClose={() => setDrawer(null)}>
        <SettingsPanel settings={settings} onUpdate={update} />
      </Drawer>

      <Drawer open={drawer === "report"} title={t("reportTitle")} onClose={() => setDrawer(null)}>
        {reportTarget && reportEnvironment && (
          <ReportPanel
            target={reportTarget}
            environment={reportEnvironment}
            appVersion={__ALFARAHEEDI_APP_VERSION__}
          />
        )}
      </Drawer>
    </div>
  );
}
