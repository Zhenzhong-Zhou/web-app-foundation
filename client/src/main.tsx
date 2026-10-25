// The app's font (ADR-055), hosted with the app: no request to a font
// service, and Latin Extended for French. Chinese uses the system's own.
import '@fontsource/source-sans-3/400.css';
import '@fontsource/source-sans-3/600.css';
import '@fontsource/source-sans-3/700.css';

import CssBaseline from '@mui/material/CssBaseline';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import App from './App.tsx';
import { AuthProvider } from './auth/auth-provider';
import { ToastProvider } from './components/toast-provider';
import { LanguageFailureToast } from './i18n/language-failure';
import { LanguageProvider } from './i18n/language-provider';
import { LocalizedTheme } from './i18n/localized-theme';
import { removeLoadingMark } from './lib/loading-mark';
import { initTextSize } from './theme/text-size';
import { ThemeColor } from './theme/theme-color';
import { VersionWatch } from './version/version-check';

// This device's text size (ADR-075), before anything renders, so the first
// paint is already at it rather than Standard for a moment.
initTextSize();

/**
 * A data router, so a page can hold a navigation until the person chooses
 * (useBlocker, issue #54); BrowserRouter cannot. One splat route renders
 * the app, whose own <Routes> match as before, so nothing else moves.
 */
const router = createBrowserRouter([
  {
    path: '*',
    element: (
      <AuthProvider>
        {/* A newer build noticed, signed in or out, and loaded at the next
            page (ADR-081). */}
        <VersionWatch />
        <App />
      </AuthProvider>
    ),
  },
]);

/**
 * A render error no boundary caught leaves the page empty, and no screen
 * would ever take the loading mark down (ADR-082): it goes with the app,
 * rather than seem to load for ever. Reported as React reports it.
 */
const onUncaughtError = (error: unknown) => {
  removeLoadingMark();
  reportError(error);
};

createRoot(document.getElementById('root')!, { onUncaughtError }).render(
  <StrictMode>
    {/* Outermost: the theme's built-in text, the sign-in pages and the
        account all read the language (ADR-054). */}
    <LanguageProvider>
      {/* Outside the router: theming is not route-dependent, and CssBaseline
          must apply before anything paints. */}
      <LocalizedTheme>
        <CssBaseline />
        {/* The browser's bar in the mode chosen here (ADR-082). */}
        <ThemeColor />
        {/* Inside the theme, so the toast is coloured like everything else;
            outside the router, because a confirmation should survive the
            navigation a save often triggers. */}
        <ToastProvider
          // A language that would not load: the provider above says so
          // through its context, and this, inside the theme, shows it at
          // the foot of the screen, under any confirmation (ADR-081).
          foot={<LanguageFailureToast />}
        >
          <RouterProvider router={router} />
        </ToastProvider>
      </LocalizedTheme>
    </LanguageProvider>
  </StrictMode>,
);
