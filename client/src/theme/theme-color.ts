import { useColorScheme } from '@mui/material/styles';
import { useEffect } from 'react';

import { DARK, LIGHT } from './tokens';

/**
 * A phone's bar in the page's colour (ADR-082). index.html gives it one
 * theme-color for the system's light mode and one for its dark; someone who
 * chose Light or Dark in the app gets that mode's in both, so the bar
 * matches the page whatever the system says, and System puts each back to
 * its own. loading.js does the same before the app starts. Inside the
 * theme, whose colour mode it reads; it draws nothing.
 */
export function ThemeColor(): null {
  const { mode } = useColorScheme();

  useEffect(() => {
    // Not yet read from storage: loading.js's colours stand till it is.
    if (!mode) return;
    for (const meta of document.querySelectorAll<HTMLMetaElement>(
      'meta[name="theme-color"]',
    )) {
      const scheme =
        mode === 'system'
          ? meta.getAttribute('media')?.includes('dark')
            ? 'dark'
            : 'light'
          : mode;
      meta.content = scheme === 'dark' ? DARK.page : LIGHT.page;
    }
  }, [mode]);

  return null;
}
