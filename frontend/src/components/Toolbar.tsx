import { useI18n } from "../i18n/i18n";
import { CheckIcon, CopyIcon, ScanIcon, SparkIcon, TrashIcon } from "./Icons";

interface ToolbarProps {
  onAnalyze: () => void;
  onApplySafe: () => void;
  onCopy: () => void;
  onLoadExample: () => void;
  onClear: () => void;
  analyzing: boolean;
  applying: boolean;
  hasText: boolean;
  safeCount: number;
  copied: boolean;
}

export function Toolbar({
  onAnalyze,
  onApplySafe,
  onCopy,
  onLoadExample,
  onClear,
  analyzing,
  applying,
  hasText,
  safeCount,
  copied,
}: ToolbarProps) {
  const { t } = useI18n();
  return (
    <div className="toolbar" role="toolbar" aria-label={t("analyze")}>
      <button
        type="button"
        className="btn btn--primary"
        onClick={onAnalyze}
        disabled={analyzing || !hasText}
      >
        <ScanIcon />
        {analyzing ? t("analyzing") : t("analyze")}
      </button>

      <button
        type="button"
        className="btn"
        onClick={onApplySafe}
        disabled={applying || safeCount === 0}
        title={t("applySafeHint")}
      >
        <CheckIcon />
        {t("applySafe")}
        {safeCount > 0 && <span className="btn__count">{safeCount}</span>}
      </button>

      <div className="toolbar__spacer" />

      <button
        type="button"
        className="btn btn--ghost"
        onClick={onCopy}
        disabled={!hasText}
      >
        <CopyIcon />
        {copied ? t("copied") : t("copy")}
      </button>

      <button
        type="button"
        className="btn btn--ghost"
        onClick={onLoadExample}
      >
        <SparkIcon />
        {t("example")}
      </button>

      <button
        type="button"
        className="btn btn--ghost"
        onClick={onClear}
        disabled={!hasText}
      >
        <TrashIcon />
        {t("clear")}
      </button>
    </div>
  );
}
