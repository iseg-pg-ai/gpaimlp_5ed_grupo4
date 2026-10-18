"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import type { Locale } from "@/lib/locales";
import { themeStorageKey } from "@/lib/theme";

const labels: Record<Locale, [string, string]> = {
  pt: ["Ativar tema escuro", "Ativar tema claro"],
  en: ["Switch to dark theme", "Switch to light theme"],
  es: ["Activar tema oscuro", "Activar tema claro"],
  fr: ["Activer le thème sombre", "Activer le thème clair"],
  de: ["Dunkles Design aktivieren", "Helles Design aktivieren"],
  zh: ["切换至深色主题", "切换至浅色主题"],
};

function subscribe(notify: () => void) {
  const sync = (event: StorageEvent) => {
    if (event.key !== themeStorageKey && event.key !== null) return;
    document.documentElement.dataset.theme = event.newValue === "dark" ? "dark" : "light";
    notify();
  };
  window.addEventListener("storage", sync);
  window.addEventListener("blu-theme-change", notify);
  return () => {
    window.removeEventListener("storage", sync);
    window.removeEventListener("blu-theme-change", notify);
  };
}

export function ThemeToggle({ locale }: { locale: Locale }) {
  const dark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.theme === "dark",
    () => false,
  );
  const label = labels[locale][dark ? 1 : 0];
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={label}
      title={label}
      onClick={() => {
        const theme = dark ? "light" : "dark";
        document.documentElement.dataset.theme = theme;
        try {
          localStorage.setItem(themeStorageKey, theme);
        } catch {
          // A opção continua disponível quando o navegador bloqueia o armazenamento.
        }
        window.dispatchEvent(new Event("blu-theme-change"));
      }}
    >
      {dark ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
    </button>
  );
}
