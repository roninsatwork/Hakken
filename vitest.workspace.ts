import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'ui',
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['./vitest.setup.ts'],
    }
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'backend',
      environment: 'node',
      include: ['convex/**/*.test.{ts,tsx}'],
    }
  }
])
