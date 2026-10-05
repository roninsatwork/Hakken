import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';
import { vi } from 'vitest';
import { SCREEN_WAIT_MS } from './src/test/realTime';

// One wait for everything on screen (AGENTS.md, "Tests that never flake").
configure({ asyncUtilTimeout: SCREEN_WAIT_MS });

vi.mock('convex/react', () => ({
  useQuery: vi.fn(() => []), // Default to empty array, overridden per test
  useMutation: vi.fn(() => vi.fn()),
  useAction: vi.fn(() => vi.fn()),
  useConvexAuth: vi.fn(() => ({ isAuthenticated: true, isLoading: false })),
  usePaginatedQuery: vi.fn(() => ({ results: [], status: "Exhausted", loadMore: vi.fn() })),
}));
