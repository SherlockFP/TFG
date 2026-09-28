import { defineConfig } from 'vite';
import { resolve } from 'path';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:https` -> self-signed HTTPS dev server. Browsers only allow the microphone (voice chat)
// on https:// or localhost, so use this when friends connect over the LAN via https://<your-ip>:5173.
// KEFAL_HMR=1 enables hot reload.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'https' ? [basicSsl()] : [],
  server: { port: 5173, host: true, hmr: process.env.KEFAL_HMR === '1', watch: { ignored: ['**/.claude/**', '**/tools/raw/**'] } },
  preview: { port: 4173, host: true, allowedHosts: ['.onrender.com'] },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 8000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
}));
