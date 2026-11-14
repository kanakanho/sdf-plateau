// Static multi-page build (SSG): every page is pre-rendered into ./dist and served as
// Cloudflare Workers static assets; there is no server-side code.
import { defineConfig } from 'astro/config';
import { thirdPartyLicenses } from './scripts/licenses';

export default defineConfig({
  output: 'static',
  site: 'https://sdf-plateau.kanakanho.workers.dev',
  server: { port: 5173 },
  build: { format: 'directory' },
  vite: { plugins: [thirdPartyLicenses()] },
});
