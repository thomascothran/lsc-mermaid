import { defineConfig } from 'vitest/config';

// Resolve workspace packages to their TypeScript sources (see the `lsc-source`
// export condition in each package.json), so tests need no build step.
const SOURCE_CONDITION = 'lsc-source';

export default defineConfig({
  resolve: {
    conditions: [SOURCE_CONDITION, 'module', 'browser', 'development|production'],
  },
  ssr: {
    resolve: {
      conditions: [SOURCE_CONDITION, 'module', 'node', 'development|production'],
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'lsc-model',
          root: 'packages/lsc-model',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'mermaid-lsc',
          root: 'packages/mermaid-lsc',
          environment: 'jsdom',
          include: ['test/**/*.test.ts'],
        },
      },
    ],
  },
});
