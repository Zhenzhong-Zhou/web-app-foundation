import { ThemeProvider } from '@mui/material/styles';
import type { ReactNode } from 'react';

import { themeFor } from '../theme';
import { useBrand } from '../theme/brand-store';
import { useLanguage } from './use-language';

/**
 * The theme in the current language, so MUI's own words — pagination,
 * "No options", "Close" — follow it (ADR-054). Inside LanguageProvider,
 * which is why it is not in main.tsx's tree directly.
 */
export function LocalizedTheme({ children }: { children: ReactNode }) {
  const { locale } = useLanguage();
  // The organization's accent and rail (ADR-060), once signed in.
  const brand = useBrand();

  return (
    <ThemeProvider theme={themeFor(locale, brand)} defaultMode="system">
      {children}
    </ThemeProvider>
  );
}
