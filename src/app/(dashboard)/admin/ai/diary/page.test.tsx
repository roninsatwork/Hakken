import { describe, expect, it, vi } from "vitest";

import { WikiDiaryScreen } from "@/src/app/(dashboard)/admin/_features/wiki/WikiDiaryScreen";
import GlobalDiaryPage from "./page";

vi.mock("@/src/app/(dashboard)/admin/_features/wiki/WikiDiaryScreen", () => ({
  WikiDiaryScreen: vi.fn(() => null),
}));

describe("GlobalDiaryPage", () => {
  // The menu is the AI section's frame now (wiki-sonae-catch-up-plan-2026-11-21.md, S0), not the screen's.
  it("passes the global diary paths to the shared screen", () => {
    const page = GlobalDiaryPage();

    expect(page.type).toBe(WikiDiaryScreen);
    expect(page.props).toEqual({ pageBasePath: "/admin/ai/knowledge" });
  });
});
