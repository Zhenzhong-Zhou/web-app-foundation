// The app's font (ADR-055), hosted with the app: no request to a font
// service, and Latin Extended for French. Chinese uses the system's own.
import '@fontsource/source-sans-3/400.css';
import '@fontsource/source-sans-3/600.css';
import '@fontsource/source-sans-3/700.css';

import CssBaseline from '@mui/material/CssBaseline';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App.tsx';
import { AuthProvider } from './auth/auth-provider';
import { ToastProvider } from './components/toast-provider';
import { LanguageProvider } from './i18n/language-provider';
import { LocalizedTheme } from './i18n/localized-theme';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Outermost: the theme's built-in text, the sign-in pages and the
        account all read the language (ADR-054). */}
    <LanguageProvider>
      {/* Outside the router: theming is not route-dependent, and CssBaseline
          must apply before anything paints. */}
      <LocalizedTheme>
        <CssBaseline />
        {/* Inside the theme, so the toast is coloured like everything else;
            outside the router, because a confirmation should survive the
            navigation a save often triggers. */}
        <ToastProvider>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </ToastProvider>
      </LocalizedTheme>
    </LanguageProvider>
  </StrictMode>,
);
