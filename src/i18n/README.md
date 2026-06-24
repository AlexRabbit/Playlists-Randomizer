# i18n — contributing translations

English lives in `en/messages.ts`. To add a language:

1. Copy `en/` to a new folder, e.g. `es/`
2. Translate all strings in `messages.ts` (keep keys identical)
3. Register the locale in `index.ts`:

```ts
import { messages as es } from './es/messages';
const catalogs = { en, es };
export type Locale = 'en' | 'es';
```

4. Open a PR — no runtime language switcher yet; default is `en`

Keys use `{name}` placeholders — preserve them in translations.
