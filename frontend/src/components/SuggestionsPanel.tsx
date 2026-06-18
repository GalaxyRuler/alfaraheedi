import type { Suggestion } from "../api/types";
import { countSafe, groupByCategory } from "../lib/format";
import { useI18n } from "../i18n/i18n";
import { SuggestionCard } from "./SuggestionCard";

export type AnalyzeStatus = "idle" | "loading" | "done" | "error";

interface SuggestionsPanelProps {
  status: AnalyzeStatus;
  suggestions: Suggestion[];
  activeId: string | null;
  errorMessage: string | null;
  onActivate: (id: string) => void;
  onApply: (suggestion: Suggestion, replacement: string) => void;
}

export function SuggestionsPanel({
  status,
  suggestions,
  activeId,
  errorMessage,
  onActivate,
  onApply,
}: SuggestionsPanelProps) {
  const { t, categoryLabel } = useI18n();
  const groups = groupByCategory(suggestions);
  const safeCount = countSafe(suggestions);

  return (
    <section className="panel suggestions" aria-label={t("suggestionsTitle")}>
      <header className="panel__header">
        <h2>{t("suggestionsTitle")}</h2>
        {status === "done" && suggestions.length > 0 && (
          <span className="panel__count" data-testid="suggestion-count">
            {suggestions.length} · {t("safeShort")} {safeCount}
          </span>
        )}
      </header>

      <div className="panel__body">
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
                />
              ))}
            </div>
          ))}
      </div>
    </section>
  );
}
