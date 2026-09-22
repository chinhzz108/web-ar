import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => ({
  // Android USB testing uses adb reverse and http://localhost, which is a
  // browser-trusted secure context. Normal development keeps HTTPS enabled.
  plugins: mode === 'usb' ? [] : [basicSsl()],
  server: {
    host: mode === 'usb' ? '127.0.0.1' : true,
  },
  // Zappar's CV package loads its WASM relative to the worker module. Let Vite
  // serve those source modules directly so the .wasm response keeps the
  // application/wasm MIME type instead of being swallowed by dependency
  // prebundling as an HTML fallback.
  optimizeDeps: {
    exclude: ['@zappar/zappar-threejs', '@zappar/zappar', '@zappar/zappar-cv'],
    include: ['ua-parser-js'],
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
}));
