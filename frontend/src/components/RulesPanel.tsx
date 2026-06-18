import type { RuleInfo } from "../api/types";
import { useI18n } from "../i18n/i18n";

export type LoadStatus = "idle" | "loading" | "done" | "error";

interface RulesPanelProps {
  status: LoadStatus;
  rules: RuleInfo[];
  errorMessage: string | null;
  onReload: () => void;
}

export function RulesPanel({
  status,
  rules,
  errorMessage,
  onReload,
}: RulesPanelProps) {
  const { t, categoryLabel, ruleText } = useI18n();
  return (
    <div className="rules-panel">
      <p className="drawer__intro">{t("rulesIntro")}</p>

      {status === "loading" && <p className="state state--loading">{t("loading")}</p>}

      {status === "error" && (
        <div className="state state--error" role="alert">
          <p>{t("rulesLoadFailed")}</p>
          {errorMessage && <p className="state__detail">{errorMessage}</p>}
          <button type="button" className="btn btn--ghost" onClick={onReload}>
            {t("retry")}
          </button>
        </div>
      )}

      {status === "done" && (
        <ul className="rule-list" data-testid="rule-list">
          {rules.map((rule) => (
            <li key={rule.source} className="rule-item">
              <div className="rule-item__top">
                <code dir="ltr">{rule.source}</code>
                {rule.safe_auto_apply ? (
                  <span className="badge badge--safe">{t("badgeSafeShort")}</span>
                ) : (
                  <span className="badge badge--suggest">
                    {t("badgeSuggestShort")}
                  </span>
                )}
              </div>
              <p className="rule-item__desc">
                {ruleText(rule.source, rule.description)}
              </p>
              <p className="rule-item__cat muted">{categoryLabel(rule.category)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
