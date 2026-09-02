import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Raised from Vite's 500KB default. MUI is most of the bundle, and ADR-021
  // accepts that: this surface sits behind a login wall, where first paint is
  // not a conversion metric. Revisit when step 9 adds Refine — that is when
  // route-level lazy() starts to pay.
  build: { chunkSizeWarningLimit: 700 },
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