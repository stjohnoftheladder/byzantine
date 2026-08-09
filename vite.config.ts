import { defineConfig } from 'vite';

// Cloudflare Pages serves from root; dev server also serves from root.
export default defineConfig({
  base: '/',
});
