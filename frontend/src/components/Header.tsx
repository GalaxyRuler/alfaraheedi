import { useI18n } from "../i18n/i18n";
import { ChipIcon, GearIcon, ListIcon } from "./Icons";

export type Health = "checking" | "online" | "offline";

interface HeaderProps {
  health: Health;
  apiBaseUrl: string;
  onOpenRules: () => void;
  onOpenLlm: () => void;
  onOpenSettings: () => void;
}

export function Header({
  health,
  apiBaseUrl,
  onOpenRules,
  onOpenLlm,
  onOpenSettings,
}: HeaderProps) {
  const { t } = useI18n();
  const healthText =
    health === "online"
      ? t("engineOnline")
      : health === "offline"
        ? t("engineOffline")
        : t("engineChecking");
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">
          ف
        </span>
        <div className="brand__text">
          <h1 className="brand__name">{t("brandName")}</h1>
          <p className="brand__tag">{t("brandTag")}</p>
        </div>
      </div>

      <div className="app-header__right">
        <span
          className={`conn conn--${health}`}
          title={apiBaseUrl}
          data-testid="health"
        >
          <span className="dot" />
          {healthText}
        </span>

        <nav className="app-header__nav" aria-label={t("navPanels")}>
          <button type="button" className="icon-btn" onClick={onOpenRules} title={t("navRules")} aria-label={t("navRules")}>
            <ListIcon />
          </button>
          <button type="button" className="icon-btn" onClick={onOpenLlm} title={t("navLlm")} aria-label={t("navLlm")}>
            <ChipIcon />
          </button>
          <button type="button" className="icon-btn" onClick={onOpenSettings} title={t("navSettings")} aria-label={t("navSettings")}>
            <GearIcon />
          </button>
        </nav>
      </div>
    </header>
  );
}
