import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['build'],
      reporter: ['lcov', 'text-summary'],
      thresholds: { statements: 80, branches: 85 }
    }
  }
});
