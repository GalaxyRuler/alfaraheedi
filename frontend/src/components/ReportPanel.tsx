import { useEffect, useMemo, useState } from "react";
import type {
  FeedbackReportEnvironment,
  FeedbackReportTarget,
  RawTextMode,
} from "../lib/feedbackReport";
import { buildFeedbackReport } from "../lib/feedbackReport";
import { useI18n } from "../i18n/i18n";
import { CopyIcon } from "./Icons";

interface ReportPanelProps {
  target: FeedbackReportTarget;
  environment: FeedbackReportEnvironment;
  appVersion: string;
}

export function ReportPanel({
  target,
  environment,
  appVersion,
}: ReportPanelProps) {
  const { t, dir } = useI18n();
  const [rawTextMode, setRawTextMode] = useState<RawTextMode>("none");
  const [copied, setCopied] = useState(false);
  const hasSelectedText = Boolean(target.selectedText?.text);

  useEffect(() => {
    setRawTextMode("none");
    setCopied(false);
  }, [target]);

  useEffect(() => {
    if (rawTextMode === "selected" && !hasSelectedText) {
      setRawTextMode("none");
    }
  }, [hasSelectedText, rawTextMode]);

  const report = useMemo(
    () =>
      buildFeedbackReport({
        target,
        rawTextMode,
        environment,
        appVersion,
      }),
    [appVersion, environment, rawTextMode, target],
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(report.markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="report-panel" data-testid="report-panel">
      <p className="drawer__intro">{t("reportIntro")}</p>

      <section className="report-summary" aria-label={t("reportSummary")}>
        <dl className="kv">
          <div className="kv__row">
            <dt>{t("reportKind")}</dt>
            <dd>{target.kind === "suggestion" ? t("reportKindSuggestion") : t("reportKindAnalysis")}</dd>
          </div>
          <div className="kv__row">
            <dt>{t("reportSuggestionCount")}</dt>
            <dd>{target.suggestions.length}</dd>
          </div>
          {target.suggestion && (
            <div className="kv__row">
              <dt>{t("reportSource")}</dt>
              <dd>
                <code dir="ltr">{target.suggestion.source}</code>
              </dd>
            </div>
          )}
        </dl>
      </section>

      <fieldset className="field report-raw">
        <legend className="field__label">{t("reportRawMode")}</legend>
        <label className="field--radio">
          <input
            type="radio"
            name="rawTextMode"
            value="none"
            checked={rawTextMode === "none"}
            onChange={() => setRawTextMode("none")}
          />
          <span>{t("reportRawNone")}</span>
        </label>
        <label className="field--radio">
          <input
            type="radio"
            name="rawTextMode"
            value="selected"
            checked={rawTextMode === "selected"}
            disabled={!hasSelectedText}
            onChange={() => setRawTextMode("selected")}
          />
          <span>{t("reportRawSelected")}</span>
        </label>
        <label className="field--radio">
          <input
            type="radio"
            name="rawTextMode"
            value="full"
            checked={rawTextMode === "full"}
            onChange={() => setRawTextMode("full")}
          />
          <span>{t("reportRawFull")}</span>
        </label>
        <p className="field__hint">{t("reportRawHint")}</p>
      </fieldset>

      <textarea
        className="report-output"
        readOnly
        dir={dir}
        aria-label={t("reportOutput")}
        value={report.markdown}
      />

      <div className="report-actions">
        <button type="button" className="btn btn--primary" onClick={handleCopy}>
          <CopyIcon />
          {copied ? t("reportCopied") : t("reportCopy")}
        </button>
        <a
          className="btn"
          href={report.issueUrl}
          target="_blank"
          rel="noreferrer"
        >
          {t("reportOpenIssue")}
        </a>
      </div>
    </div>
  );
}
