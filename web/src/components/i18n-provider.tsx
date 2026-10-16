"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { type Locale, DEFAULT_LOCALE, LOCALE_STORAGE_KEY, getTranslation } from "@/lib/i18n";

type I18nContextValue = {
  locale: Locale;
  isFr: boolean;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function savedLocale(): Locale {
  return "fr";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale] = useState<Locale>("fr");

  useEffect(() => {
    document.documentElement.lang = "fr";
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, "fr");
    } catch {
      /* ignore */
    }
  }, []);

  const setLocale = useCallback((_next: Locale) => {}, []);
  const toggleLocale = useCallback(() => {}, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      return getTranslation(locale, key, params);
    },
    [locale]
  );

  const isFr = locale === "fr";

  const value = useMemo(
    () => ({ locale, isFr, setLocale, toggleLocale, t }),
    [locale, isFr, setLocale, toggleLocale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    // Graceful fallback for components used outside the provider (e.g. tests)
    return {
      locale: DEFAULT_LOCALE,
      isFr: DEFAULT_LOCALE === "fr",
      setLocale: () => {},
      toggleLocale: () => {},
      t: (key: string, params?: Record<string, string | number>) => getTranslation(DEFAULT_LOCALE, key, params),
    };
  }
  return context;
}
