export const languages = [
  { code: "pt", name: "Português", flag: "PT", html: "pt-PT" },
  { code: "en", name: "English", flag: "GB", html: "en" },
  { code: "zh", name: "中文（普通话）", flag: "CN", html: "zh-Hans" },
  { code: "es", name: "Español", flag: "ES", html: "es" },
  { code: "fr", name: "Français", flag: "FR", html: "fr" },
  { code: "de", name: "Deutsch", flag: "DE", html: "de" },
] as const;
export type Locale = (typeof languages)[number]["code"];
export function isLocale(value: unknown): value is Locale {
  return languages.some((l) => l.code === value);
}
