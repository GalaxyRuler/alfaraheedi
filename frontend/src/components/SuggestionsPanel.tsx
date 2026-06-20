import type { LlmSuggestion, Suggestion } from "../api/types";
import { countSafe, groupByCategory } from "../lib/format";
import { useI18n } from "../i18n/i18n";
import { SuggestionCard } from "./SuggestionCard";

export type AnalyzeStatus = "idle" | "loading" | "done" | "error";
export type LlmSuggestStatus = "idle" | "loading" | "done" | "error";

interface SuggestionsPanelProps {
  status: AnalyzeStatus;
  suggestions: Suggestion[];
  llmStatus: LlmSuggestStatus;
  llmSuggestion: LlmSuggestion | null;
  llmErrorMessage: string | null;
  activeId: string | null;
  errorMessage: string | null;
  onActivate: (id: string) => void;
  onApply: (suggestion: Suggestion, replacement: string) => void;
  onApplyLlmSuggestion: (replacement: string) => void;
  onReportAnalysis: () => void;
  onReportSuggestion: (suggestion: Suggestion) => void;
}

export function SuggestionsPanel({
  status,
  suggestions,
  llmStatus,
  llmSuggestion,
  llmErrorMessage,
  activeId,
  errorMessage,
  onActivate,
  onApply,
  onApplyLlmSuggestion,
  onReportAnalysis,
  onReportSuggestion,
}: SuggestionsPanelProps) {
  const { t, categoryLabel } = useI18n();
  const groups = groupByCategory(suggestions);
  const safeCount = countSafe(suggestions);

  return (
    <section className="panel suggestions" aria-label={t("suggestionsTitle")}>
      <header className="panel__header">
        <h2>{t("suggestionsTitle")}</h2>
        {status === "done" && (
          <div className="panel__actions">
            {suggestions.length > 0 && (
              <span className="panel__count" data-testid="suggestion-count">
                {suggestions.length} · {t("safeShort")} {safeCount}
              </span>
            )}
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={onReportAnalysis}
            >
              {t("reportAnalysis")}
            </button>
          </div>
        )}
      </header>

      <div className="panel__body">
        {llmStatus === "loading" && (
          <p className="state state--loading" role="status">
            {t("llmSuggesting")}
          </p>
        )}

        {llmStatus === "error" && (
          <div className="state state--error" role="alert">
            <p>{t("llmSuggestionFailed")}</p>
            {llmErrorMessage && <p className="state__detail">{llmErrorMessage}</p>}
            <p className="state__detail">{t("llmPolicyNote")}</p>
          </div>
        )}

        {llmStatus === "done" && llmSuggestion && (
          <article className="llm-suggestion" data-testid="llm-suggestion">
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
                onClick={() => onApplyLlmSuggestion(llmSuggestion.replacement)}
              >
                {t("llmApplySuggestion")}
              </button>
            </footer>
          </article>
        )}

        {status === "loading" && (
          <p className="state state--loading" role="status">
            {t("stateAnalyzing")}
          </p>
        )}

        {status === "error" && (
          <div className="state state--error" role="alert">
            <p>{t("stateAnalyzeFailed")}</p>
            {errorMessage && <p className="state__detail">{errorMessage}</p>}
          </div>
        )}

        {status === "idle" && (
          <div className="state state--empty">
            <p>{t("stateIdleTitle")}</p>
            <p className="muted">{t("stateIdleHint")}</p>
          </div>
        )}

        {status === "done" && suggestions.length === 0 && (
          <div className="state state--empty">
            <p>{t("stateNone")}</p>
          </div>
        )}

        {status === "done" &&
          groups.map((group) => (
            <div key={group.category} className="suggestion-group">
              <h3 className="suggestion-group__title">
                {categoryLabel(group.category)}
                <span className="suggestion-group__count">
                  {group.suggestions.length}
                </span>
              </h3>
              {group.suggestions.map((suggestion) => (
                <SuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  isActive={suggestion.id === activeId}
                  onActivate={onActivate}
                  onApply={onApply}
                  onReport={onReportSuggestion}
                />
              ))}
            </div>
          ))}
      </div>
    </section>
  );
}
