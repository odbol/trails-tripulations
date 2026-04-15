import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'public',
  build: {
    outDir: 'docs',
  },
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['gojira'],
  },
});
