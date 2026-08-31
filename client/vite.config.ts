import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin in development, mirroring production where a reverse proxy
    // serves the SPA and forwards /api (ADR-011). Calling localhost:3000
    // directly would mean debugging CORS and sameSite: 'none' problems that
    // will never exist in production — and ADR-014's CSRF defence is a
    // consequence of CORS, so relaxing it would silently remove that layer.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});