import { createContext, useContext, useMemo } from "react";
import type { Category, Severity } from "../api/types";
import { CATEGORY_LABELS, RULE_TEXT_AR, SEVERITY_LABELS } from "../lib/format";
import { type Lang, type StringKey, translate } from "./strings";

interface I18n {
  lang: Lang;
  dir: "rtl" | "ltr";
  t: (key: StringKey) => string;
  categoryLabel: (category: Category) => string;
  severityLabel: (severity: Severity) => string;
  // Rule descriptions/explanations come from the engine in English. In Arabic we
  // localize the known rules and fall back to the engine string otherwise.
  ruleText: (source: string, fallback: string) => string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({
  lang,
  children,
}: {
  lang: Lang;
  children: React.ReactNode;
}) {
  const value = useMemo<I18n>(
    () => ({
      lang,
      dir: lang === "ar" ? "rtl" : "ltr",
      t: (key) => translate(lang, key),
      categoryLabel: (category) => CATEGORY_LABELS[category][lang],
      severityLabel: (severity) => SEVERITY_LABELS[severity][lang],
      ruleText: (source, fallback) =>
        lang === "ar" ? (RULE_TEXT_AR[source] ?? fallback) : fallback,
    }),
    [lang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within I18nProvider");
  return value;
}
