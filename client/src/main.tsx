// The app's font (ADR-055), hosted with the app: no request to a font
// service, and Latin Extended for French. Chinese uses the system's own.
import '@fontsource/source-sans-3/400.css';
import '@fontsource/source-sans-3/600.css';
import '@fontsource/source-sans-3/700.css';

import CssBaseline from '@mui/material/CssBaseline';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import { ToastProvider } from './components/toast-provider';
import { reportFault, startReporting } from './errors/report-fault';
import { LanguageFailureToast } from './i18n/language-failure';
import { LanguageProvider } from './i18n/language-provider';
import { LocalizedTheme } from './i18n/localized-theme';
import { removeLoadingMark } from './lib/loading-mark';
import { ROOT_ROUTE } from './root-route';
import { initTextSize } from './theme/text-size';
import { ThemeColor } from './theme/theme-color';

// This device's text size (ADR-075), before anything renders, so the first
// paint is already at it rather than Standard for a moment.
initTextSize();

/**
 * A data router, so a page can hold a navigation until the person chooses
 * (useBlocker, issue #54); BrowserRouter cannot. One splat route renders
 * the app, whose own <Routes> match as before, so nothing else moves
 * (root-route.tsx).
 */
const router = createBrowserRouter([ROOT_ROUTE]);

/**
 * A render error outside the router, in the language, the theme or the
 * toasts around it, or in the route's own crash page: anything inside the
 * route shows that page (root-route.tsx). Out here, nothing catches it,
 * the page is left empty, and no screen would ever take the loading mark
 * down (ADR-082): it goes with the app, rather than seem to load for ever.
 * Reported as React reports it, and to the error tracker (ADR-084), whose
 * handler also hears the first: the SDK sends one report of the two.
 */
const onUncaughtError = (error: unknown) => {
  removeLoadingMark();
  reportFault(error);
  reportError(error);
};

// The error tracker, once the first screen has drawn (ADR-084).
void startReporting();

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
