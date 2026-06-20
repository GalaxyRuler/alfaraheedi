import type { Suggestion } from "../api/types";
import { renderReplacement } from "../lib/format";
import { useI18n } from "../i18n/i18n";

interface SuggestionCardProps {
  suggestion: Suggestion;
  isActive: boolean;
  onActivate: (id: string) => void;
  onApply: (suggestion: Suggestion, replacement: string) => void;
  onReport: (suggestion: Suggestion) => void;
}

export function SuggestionCard({
  suggestion,
  isActive,
  onActivate,
  onApply,
  onReport,
}: SuggestionCardProps) {
  const { t, severityLabel, ruleText } = useI18n();
  const deleteLabel = t("deleteToken");

  return (
    <article
      className={`suggestion${isActive ? " suggestion--active" : ""}`}
      data-testid="suggestion"
      aria-current={isActive}
    >
      <button
        type="button"
        className="suggestion__head"
        onClick={() => onActivate(suggestion.id)}
        title={t("locateHint")}
      >
        <span className={`sev sev--${suggestion.severity.toLowerCase()}`}>
          {severityLabel(suggestion.severity)}
        </span>
        <code className="suggestion__source" dir="ltr">
          {suggestion.source}
        </code>
        {suggestion.safe_auto_apply ? (
          <span className="badge badge--safe">{t("badgeSafe")}</span>
        ) : (
          <span className="badge badge--suggest">{t("badgeSuggest")}</span>
        )}
      </button>

      <p className="suggestion__explanation">
        {ruleText(suggestion.source, suggestion.explanation)}
      </p>

      <div className="suggestion__diff">
        <span className="suggestion__original" dir="auto">
          {renderReplacement(suggestion.original, deleteLabel)}
        </span>
        <span className="suggestion__arrow" aria-hidden="true">
          ←
        </span>
        <span className="suggestion__replacements">
          {suggestion.replacements.length === 0 ? (
            <span className="muted">{t("noReplacement")}</span>
          ) : (
            suggestion.replacements.map((replacement, index) => (
              <button
                key={index}
                type="button"
                className="chip chip--apply"
                dir="auto"
                onClick={() => onApply(suggestion, replacement)}
                title={t("applyOneHint")}
              >
                {renderReplacement(replacement, deleteLabel)}
              </button>
            ))
          )}
        </span>
      </div>

      <footer className="suggestion__meta">
        <span>
          {t("confidence")} {(suggestion.confidence * 100).toFixed(0)}%
        </span>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => onReport(suggestion)}
        >
          {t("reportSuggestion")}
        </button>
      </footer>
    </article>
  );
}
