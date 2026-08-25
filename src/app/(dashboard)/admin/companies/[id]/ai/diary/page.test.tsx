import { describe, expect, it, vi } from "vitest";

import { WikiDiaryScreen } from "@/src/app/(dashboard)/admin/_features/wiki/WikiDiaryScreen";
import CompanyDiaryPage from "./page";

vi.mock("@/src/app/(dashboard)/admin/_features/wiki/WikiDiaryScreen", () => ({
  WikiDiaryScreen: vi.fn(() => null),
}));

describe("CompanyDiaryPage", () => {
  it("passes the route company and page path to the shared screen", async () => {
    const page = await CompanyDiaryPage({
      params: Promise.resolve({ id: "company_test" }),
    });

    expect(page.type).toBe(WikiDiaryScreen);
    expect(page.props).toMatchObject({
      companyId: "company_test",
      pageBasePath: "/admin/companies/company_test/ai/pages",
    });
  });
});
