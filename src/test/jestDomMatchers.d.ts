/**
 * jest-dom's checks (`toBeInTheDocument`, `toHaveValue`, …) in Vitest 5's types. Vitest 5 reads custom checks from
 * its `Matchers<R, T>`, and its `Assertion` takes two type parameters; jest-dom 7.0.1 still declares its checks on the
 * one-parameter `Assertion` of Vitest 4, which no longer joins it (dependency-updates-plan.md, phase 7, 2026-10-22).
 * Remove this once jest-dom declares them for Vitest 5 itself.
 */
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars -- a declaration merged into Vitest's own
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> extends TestingLibraryMatchers<unknown, R> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- a declaration merged into Vitest's own
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<unknown, unknown> {}
}
