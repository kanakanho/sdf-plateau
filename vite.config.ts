/// <reference types="vitest/config" />
// Vitest only: the app itself is built by Astro (astro.config.mjs).
import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    environment: 'node',
    pool: 'forks',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    testTimeout: 60000,
    setupFiles: ['./test/setup.ts'],
  },
});
