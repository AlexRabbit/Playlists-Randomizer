import { messages as en, type MessageKey } from './en/messages';

export type Locale = 'en';

const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
};

const catalogs: Record<Locale, Record<MessageKey, string>> = { en };

let locale: Locale = 'en';

const STORAGE_KEY = 'prr-locale';

export function initLocale(): void {
  const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
  if (saved && catalogs[saved]) locale = saved;
}

export function setLocale(next: Locale): void {
  if (!catalogs[next]) return;
  locale = next;
  localStorage.setItem(STORAGE_KEY, next);
}

export function getLocale(): Locale {
  return locale;
}

export function getLocaleLabel(loc: Locale): string {
  return LOCALE_LABELS[loc] ?? loc;
}

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let s = catalogs[locale][key] ?? catalogs.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return s;
}

export function listLocales(): Locale[] {
  return Object.keys(catalogs) as Locale[];
}

export function onLocaleChange(fn: () => void): void {
  document.addEventListener('prr:locale', fn);
}

export function notifyLocaleChange(): void {
  document.dispatchEvent(new CustomEvent('prr:locale'));
}
