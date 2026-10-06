import { ThemeProvider } from '@mui/material/styles';
import type { ReactNode } from 'react';

import { themeFor } from '../theme';
import { useLanguage } from './use-language';

/**
 * The theme in the current language, so MUI's own words — pagination,
 * "No options", "Close" — follow it (ADR-054). Inside LanguageProvider,
 * which is why it is not in main.tsx's tree directly.
 */
export function LocalizedTheme({ children }: { children: ReactNode }) {
  const { locale } = useLanguage();

  return (
    <ThemeProvider theme={themeFor(locale)} defaultMode="system">
      {children}
    </ThemeProvider>
  );
}
