import { describe, expect, it, vi } from "vitest";

import { WikiDiaryScreen } from "@/src/app/(dashboard)/admin/_features/wiki/WikiDiaryScreen";
import GlobalDiaryPage from "./page";

vi.mock("@/src/app/(dashboard)/admin/_features/wiki/WikiDiaryScreen", () => ({
  WikiDiaryScreen: vi.fn(() => null),
}));

describe("GlobalDiaryPage", () => {
  it("passes the global diary paths and navigation to the shared screen", () => {
    const page = GlobalDiaryPage();

    expect(page.type).toBe(WikiDiaryScreen);
    expect(page.props).toMatchObject({
      pageBasePath: "/admin/ai/knowledge",
      showWorkspaceNav: true,
    });
  });
});
