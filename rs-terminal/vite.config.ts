import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base: the build works at any GitHub Pages subpath without a repo name.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5175 },
});
