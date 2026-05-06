import '@testing-library/jest-dom';
import { vi } from 'vitest';

vi.mock('convex/react', () => ({
  useQuery: vi.fn(() => []), // Default to empty array, overridden per test
  useMutation: vi.fn(() => vi.fn()),
  useAction: vi.fn(() => vi.fn()),
  useConvexAuth: vi.fn(() => ({ isAuthenticated: true, isLoading: false })),
  usePaginatedQuery: vi.fn(() => ({ results: [], status: "Exhausted", loadMore: vi.fn() })),
}));
