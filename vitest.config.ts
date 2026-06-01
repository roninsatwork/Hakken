import { defineConfig } from 'vitest/config'
import type { UserConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

const rootAlias = {
  '@': path.resolve(__dirname, './'),
}

type VitestPlugin = NonNullable<UserConfig['plugins']>[number]

const reactPlugin = react() as unknown as VitestPlugin

export default defineConfig({
  plugins: [reactPlugin],
  resolve: {
    alias: rootAlias,
  },
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'html', 'json-summary'],
      all: true,
      include: ['src/**/*.{ts,tsx}', 'convex/**/*.ts'],
      exclude: [
        'adk-python/**',
        'convex/_generated/**',
        'coverage/**',
        'node_modules/**',
        '.next/**',
        '**/*.config.{ts,tsx,js,mjs,cjs}',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        'src/**/_generated/**',
        'vitest.setup.ts',
      ],
      thresholds: {
        lines: 17,
        branches: 50,
        functions: 58,
        statements: 17,
      },
    },
    projects: [
      {
        plugins: [reactPlugin],
        resolve: {
          alias: rootAlias,
        },
        test: {
          name: 'ui',
          globals: true,
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          setupFiles: ['./vitest.setup.ts'],
        },
      },
      {
        resolve: {
          alias: rootAlias,
        },
        test: {
          name: 'backend',
          globals: true,
          environment: 'node',
          include: ['convex/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
})
