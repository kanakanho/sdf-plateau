import { defineConfig } from 'vitest/config';
import { thirdPartyLicenses } from './scripts/licenses';

export default defineConfig({
  server: { port: 5173 },
  plugins: [thirdPartyLicenses()],
  test: {
    environment: 'node',
    pool: 'forks',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    testTimeout: 60000,
    setupFiles: ['./test/setup.ts'],
  },
});
