import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";

import AppDashboardPage from "./page";

/**
 * The app's front page keeps everyone who lands on it, super admins too (Anthony, 21 November 2026: "remove the auto
 * redirect of super admins to the admin section on first load"). Until then it sent a super admin on to /admin the first
 * time a tab opened it.
 */

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", async () => ({
  ...(await import("@/src/test/screenMocks")).nextNavigation(),
  useRouter: () => router,
  usePathname: () => "/app",
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));

describe("the app's front page", () => {
  it("keeps a super admin on the page, never sending them to Admin", () => {
    // Whatever is asked of the backend, the caller is a super admin.
    vi.mocked(useQuery).mockImplementation((() => ({ _id: "user_1", role: "SUPER_ADMIN", name: "Anthony" })) as typeof useQuery);
    sessionStorage.clear();
    render(<AppDashboardPage />);
    expect(screen.getAllByRole("heading").length).toBeGreaterThan(0);
    expect(router.push).not.toHaveBeenCalledWith("/admin");
    expect(router.replace).not.toHaveBeenCalledWith("/admin");
    expect(sessionStorage.getItem("admin_redirected")).toBeNull();
  });
});
