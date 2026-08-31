import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AuthProvider } from './auth/auth-provider';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
