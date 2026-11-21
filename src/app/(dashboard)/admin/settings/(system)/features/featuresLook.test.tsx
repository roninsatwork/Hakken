import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { beforeEach, describe, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { expectApprovedLook } from "@/src/test/lookOutline";
import { answerQueries } from "@/src/test/siteViewFixtures";
import SystemSettingsLayout from "../layout";
import PlatformFeaturesPage from "./page";
import CompanyFeaturesPage from "../../../companies/[id]/features/page";

/**
 * Features hold to the look Anthony approved on the canvas "Hakken — Features,
 * for everyone and per company", 2026-11-21 ("im happy with the screens for
 * now - im happy for you to build it"; docs/plans/active/features-switches-plan-2026-11-21.md):
 * board 1, System Settings → Features inside System Settings' own tabs, and
 * board 2, a company's Features tab. Each reads as the outline saved beside it
 * in docs/plans/assets/features-switches/look/.
 */

const { nav } = vi.hoisted(() => ({ nav: { path: "/admin/settings/features" } }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => nav.path,
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: "company_1" }),
}));

const PLAN = "features-switches";

/** The boards' example: Clarity off for everyone, Bing off for 2 of the 6 companies, and for Period House Group. */
const answer = () => vi.mocked(useQuery).mockImplementation(answerQueries({
  "users:getMe": { role: "SUPER_ADMIN" },
  "featureSwitches:getFeatureSwitches": {
    offForEveryone: ["clarity"],
    companyOff: ["bingWebmaster"],
    companies: 6,
    ticked: [{ feature: "bingWebmaster", companies: 4 }, { feature: "hakkenTasks", companies: 5 }],
  },
  "companies:getCompanyById": { _id: "company_1", name: "Period House Group", enabledModules: ["wiki"] },
  "companies:getPlanGrantsForCompany": null,
}));

describe("the approved look of Features", () => {
  beforeEach(() => {
    nav.path = "/admin/settings/features";
  });

  it("Main — System Settings → Features, for every company", async () => {
    answer();
    const { container } = render(<SystemSettingsLayout><PlatformFeaturesPage /></SystemSettingsLayout>);
    await screen.findByRole("checkbox", { name: "Microsoft Clarity" });
    await expectApprovedLook(container, PLAN, "Main", "Admin → System Settings → Features");
  });

  it("Company — a company's Features tab, with the menu", async () => {
    nav.path = "/admin/companies/company_1/features";
    answer();
    const { container } = render(<CompanyFeaturesPage />);
    await screen.findByText("Off for everyone");
    await expectApprovedLook(container, PLAN, "Company", "Admin → Companies → a company → Features");
  });
});
