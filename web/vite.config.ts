import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_TARGET = process.env['API_TARGET'] ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // During development the API runs on its own port: forward it so the app uses relative URLs.
    proxy: { '/api': API_TARGET },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
