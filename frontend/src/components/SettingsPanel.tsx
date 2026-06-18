import type { Direction, Settings } from "../state/settings";
import { DEFAULT_SETTINGS } from "../state/settings";
import { useI18n } from "../i18n/i18n";
import { LANGS } from "../i18n/strings";

interface SettingsPanelProps {
  settings: Settings;
  onUpdate: (patch: Partial<Settings>) => void;
}

export function SettingsPanel({ settings, onUpdate }: SettingsPanelProps) {
  const { t } = useI18n();

  const directions: { value: Direction; label: string }[] = [
    { value: "rtl", label: t("dirRtl") },
    { value: "ltr", label: t("dirLtr") },
    { value: "auto", label: t("dirAuto") },
  ];

  return (
    <div className="settings-panel">
      <fieldset className="field">
        <legend className="field__label">{t("settingsLanguage")}</legend>
        <div className="segmented">
          {LANGS.map((option) => (
            <label
              key={option.value}
              className={`segmented__option${
                settings.language === option.value ? " is-selected" : ""
              }`}
            >
              <input
                type="radio"
                name="language"
                value={option.value}
                checked={settings.language === option.value}
                onChange={() => onUpdate({ language: option.value })}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span className="field__label">{t("settingsApiUrl")}</span>
        <input
          type="url"
          className="field__input"
          dir="ltr"
          value={settings.apiBaseUrl}
          spellCheck={false}
          onChange={(event) => onUpdate({ apiBaseUrl: event.target.value })}
        />
        <span className="field__hint muted">
          {t("settingsDefault")}: {DEFAULT_SETTINGS.apiBaseUrl}
        </span>
      </label>

      <fieldset className="field">
        <legend className="field__label">{t("settingsDirection")}</legend>
        <div className="segmented">
          {directions.map((option) => (
            <label
              key={option.value}
              className={`segmented__option${
                settings.direction === option.value ? " is-selected" : ""
              }`}
            >
              <input
                type="radio"
                name="direction"
                value={option.value}
                checked={settings.direction === option.value}
                onChange={() => onUpdate({ direction: option.value })}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="field field--toggle">
        <input
          type="checkbox"
          checked={settings.rememberDraft}
          onChange={(event) => onUpdate({ rememberDraft: event.target.checked })}
        />
        <span>
          <span className="field__label">{t("settingsRemember")}</span>
          <span className="field__hint muted">{t("settingsRememberHint")}</span>
        </span>
      </label>

      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => onUpdate(DEFAULT_SETTINGS)}
      >
        {t("settingsReset")}
      </button>
    </div>
  );
}
