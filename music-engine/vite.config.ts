import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // host: true lets you open the dev server from a phone on the same LAN
  server: { host: true },
  build: { target: 'es2020' },
});
