import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Fail rather than drift to 5174: CLIENT_URL is baked into every
    // verification and reset link (ADR-017), and a silently moved port turns
    // those into dead links with nothing in the logs.
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // Nest has no global prefix — it serves /v1/... (ADR-013). /api is a
        // browser-side convention only, stripped before forwarding. Without
        // this every request 404s at /api/v1/... and the failure looks like a
        // missing route rather than a proxy misconfiguration.
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});