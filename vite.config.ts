import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works at any GitHub Pages path
// (e.g. https://<user>.github.io/<repo>/) without hardcoding a repo name.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173 },
});
