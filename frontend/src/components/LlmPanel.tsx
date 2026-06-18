import type { LlmStatus } from "../api/types";
import { useI18n } from "../i18n/i18n";
import type { LoadStatus } from "./RulesPanel";

interface LlmPanelProps {
  status: LoadStatus;
  data: LlmStatus | null;
  errorMessage: string | null;
  onReload: () => void;
}

export function LlmPanel({ status, data, errorMessage, onReload }: LlmPanelProps) {
  const { t } = useI18n();
  return (
    <div className="llm-panel" data-testid="llm-panel">
      <p className="drawer__intro">{t("llmIntro")}</p>

      {status === "loading" && <p className="state state--loading">{t("loading")}</p>}

      {status === "error" && (
        <div className="state state--error" role="alert">
          <p>{t("llmLoadFailed")}</p>
          {errorMessage && <p className="state__detail">{errorMessage}</p>}
          <p className="policy-note">{t("llmPolicyNote")}</p>
          <button type="button" className="btn btn--ghost" onClick={onReload}>
            {t("retry")}
          </button>
        </div>
      )}

      {status === "done" && data && (
        <>
          <dl className="kv">
            <div className="kv__row">
              <dt>{t("llmConfigured")}</dt>
              <dd>
                <span className={`dot ${data.available ? "dot--on" : "dot--off"}`} />
                {data.available ? t("yes") : t("no")}
              </dd>
            </div>
            <div className="kv__row">
              <dt>{t("llmDefault")}</dt>
              <dd dir="ltr">{data.catalog.policy.default_model_id}</dd>
            </div>
            <div className="kv__row">
              <dt>{t("llmPolicy")}</dt>
              <dd>
                <span className="badge badge--suggest" dir="ltr">
                  {data.catalog.policy.decision_role}
                </span>
              </dd>
            </div>
            <div className="kv__row">
              <dt>{t("llmBundled")}</dt>
              <dd>{data.catalog.policy.bundled_weights ? t("yes") : t("no")}</dd>
            </div>
          </dl>
          <p className="policy-note">{data.reason}</p>
          <ul className="rule-list">
            {data.catalog.models.map((model) => (
              <li key={model.id} className="rule-item">
                <div className="rule-item__top">
                  <code dir="ltr">{model.id}</code>
                  <span className="badge badge--suggest" dir="ltr">
                    {model.quantization}
                  </span>
                </div>
                <p className="rule-item__desc">{model.display_name}</p>
                <p className="rule-item__cat muted" dir="ltr">
                  {model.repo}/{model.filename}
                </p>
              </li>
            ))}
          </ul>
          <p className="policy-note">{t("llmPolicyNote")}</p>
        </>
      )}
    </div>
  );
}
