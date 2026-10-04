// The drawing kit has no database. The top bar asks who is signed in and how
// many notifications wait; everything else is still loading.
import { getFunctionName } from "convex/server";

const FIXTURES: Record<string, unknown> = {
  "users:getMe": { _id: "user", name: "Anthony Basker", email: "anthony@example.com", role: "ADMIN", image: null, companyId: "company" },
  "notifications:countMineUnread": 0,
};

export const useQuery = (ref: unknown) => {
  try { return FIXTURES[getFunctionName(ref as never)]; } catch { return undefined; }
};
export const useMutation = () => async () => undefined;
export const useAction = () => async () => undefined;
export const useConvex = () => ({});
export const useConvexAuth = () => ({ isAuthenticated: true, isLoading: false });
export const usePaginatedQuery = () => ({ results: [], status: "Exhausted", loadMore() {}, isLoading: false });
