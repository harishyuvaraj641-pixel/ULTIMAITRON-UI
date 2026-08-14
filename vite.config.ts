import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1400,
  },
  worker: {
    format: 'es',
  },
  // .glsl / .vert / .frag are loaded with Vite's built-in `?raw` suffix,
  // so no extra plugin dependency is required.
  assetsInclude: ['**/*.glsl', '**/*.vert', '**/*.frag'],
});
