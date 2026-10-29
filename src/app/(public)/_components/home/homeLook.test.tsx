import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { HomeScreen } from "./HomeScreen";
import { RAIN_DROPS, rainDrops } from "@/src/ui/components/public/rainDrops";

/**
 * The home page holds to the look Anthony approved on the "Hakken home page"
 * canvas on 2026-10-29 (docs/plans/active/home-page-plan.md; design-drift-plan
 * D4): board Rain of docs/plans/assets/home-page/.
 */

vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

describe("Home", () => {
  it("one screen: the words and one Sign in on the left, rain on the right, as drawn", async () => {
    const { container } = render(<HomeScreen copyright="© 2026 Hakken. All rights reserved." />);
    await expectApprovedLook(container, "home-page", "Rain", "Home");
    const signIns = screen.getAllByRole("link", { name: "Sign in" });
    expect(signIns).toHaveLength(2);
    for (const link of signIns) expect(link).toHaveAttribute("href", "/login");
    expect(screen.getByText("© 2026 Hakken. All rights reserved.")).toBeInTheDocument();
    expect(container.querySelectorAll(".hk-drop")).toHaveLength(RAIN_DROPS);
  });

  it("says what Hakken does in Anthony's words, with no logo above the title", () => {
    render(<HomeScreen copyright="©" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hakken");
    expect(screen.getByText(/do the work of an SEO firm/)).toBeInTheDocument();
    expect(screen.getByText(/tell you what to change and why, with the research to back it up/)).toBeInTheDocument();
    expect(screen.queryByText("HAKKEN")).not.toBeInTheDocument();
  });

  it("the rain lands in the same places every time, inside the panel", () => {
    const drops = rainDrops();
    expect(drops).toEqual(rainDrops());
    expect(drops).toHaveLength(RAIN_DROPS);
    for (const drop of drops) {
      expect(drop.x).toBeGreaterThanOrEqual(5);
      expect(drop.x).toBeLessThanOrEqual(95);
      expect(drop.y).toBeGreaterThanOrEqual(6);
      expect(drop.y).toBeLessThanOrEqual(94);
      expect(drop.period).toBeGreaterThanOrEqual(5);
      expect(drop.delay).toBeLessThanOrEqual(0);
    }
    expect(drops.filter((drop) => drop.hard).map((drop) => drop.size)).toEqual([260, 260, 260, 260, 260]);
  });
});
