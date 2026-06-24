import { messages as en, type MessageKey } from './en/messages';

export type Locale = 'en';

const catalogs: Record<Locale, Record<MessageKey, string>> = { en };

let locale: Locale = 'en';

export function setLocale(next: Locale): void {
  if (catalogs[next]) locale = next;
}

export function getLocale(): Locale {
  return locale;
}

/** Translate key; optional {name} style placeholders */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let s = catalogs[locale][key] ?? catalogs.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return s;
}

/** For contributors: add src/i18n/XX/messages.ts and register in catalogs */
export function listLocales(): Locale[] {
  return Object.keys(catalogs) as Locale[];
}
