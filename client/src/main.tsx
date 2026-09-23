import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App.tsx';
import { AuthProvider } from './auth/auth-provider';
import { ToastProvider } from './components/toast-provider';
import { theme } from './theme';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Outside the router: theming is not route-dependent, and CssBaseline
        must apply before anything paints. */}
    <ThemeProvider theme={theme} defaultMode="system">
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
    </ThemeProvider>
  </StrictMode>,
);
