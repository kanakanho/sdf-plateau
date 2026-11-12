import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { port: 5173 },
  test: {
    environment: 'node',
    pool: 'forks',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    testTimeout: 60000,
    setupFiles: ['./test/setup.ts'],
  },
});
