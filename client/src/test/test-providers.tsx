import type { ReactNode } from 'react';

import { LanguageProvider } from '../i18n/language-provider';

/**
 * What every component test renders inside, without asking: the language,
 * which jsdom's navigator makes English (ADR-054). So a spec reads the same
 * English labels as before, and `getByRole(…, { name })` lookups do not
 * change when a component's words move into the catalogue.
 *
 * Applied to render and renderHook in setup.ts, so a spec never has to
 * remember it; a spec's own `wrapper` still goes inside this one.
 */
export function TestProviders({ children }: { children: ReactNode }) {
  return <LanguageProvider>{children}</LanguageProvider>;
}
