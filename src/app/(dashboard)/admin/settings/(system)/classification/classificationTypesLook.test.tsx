import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { beforeEach, describe, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { expectApprovedLook } from "@/src/test/lookOutline";
import { answerQueries } from "@/src/test/siteViewFixtures";
import SystemSettingsLayout from "../layout";
import { ClassificationTypeEditor } from "./ClassificationTypeEditor";
import ClassificationTypesPage from "./page";

/**
 * System Settings → Classification holds to the look Anthony approved on the
 * canvas "System Settings — Classification", 2026-10-15 ("Yes, that's right.
 * Build it."; docs/plans/active/classification-types-plan.md): each board,
 * rendered in English with sample rows inside System Settings' own tabs,
 * reads as the outline saved beside it in
 * docs/plans/assets/classification-types/look/.
 */

const { nav } = vi.hoisted(() => ({ nav: { path: "/admin/settings/classification" } }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => nav.path,
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

const PLAN = "classification-types";
const SCREEN = "Admin → System Settings → Classification";

const type = (key: string, name: string, builtIn: boolean, classifications: number) => ({ key, name, builtIn, classifications, more: false });

/** Board 1: the shipped seven, and two types added. */
const list = {
  types: [
    type("INFORMATIONAL", "Informational content", true, 41),
    type("SERVICE", "Service", true, 36),
    type("PRODUCT", "Product", true, 12),
    type("CASE_STUDY", "Case study", true, 18),
    type("COMPANY", "Company", true, 22),
    type("LEGAL", "Legal", true, 15),
    type("OTHER", "Other", true, 9),
    type("k_location", "Location page", false, 2),
    type("k_careers", "Careers", false, 0),
  ],
  counted: 300,
  most: 50,
};

const detail = (overrides: Record<string, unknown>) => ({
  key: "INFORMATIONAL", nameEn: "Informational content", builtIn: true, addedAt: null, classifications: 41, websites: 12, more: false, ...overrides,
});

const answer = (detailed: unknown = null) => vi.mocked(useQuery).mockImplementation(answerQueries({
  "classificationTypes:classificationTypeList": list,
  "classificationTypes:classificationTypeDetail": detailed,
}));

describe("the approved look of System Settings → Classification", () => {
  beforeEach(() => {
    nav.path = "/admin/settings/classification";
  });

  it("Main — every type and who uses it", async () => {
    answer();
    const { container } = render(<SystemSettingsLayout><ClassificationTypesPage /></SystemSettingsLayout>);
    await screen.findByText("Careers");
    await expectApprovedLook(container, PLAN, "Main", SCREEN);
  });

  it("Add — a new type", async () => {
    nav.path = "/admin/settings/classification/new";
    answer();
    const { container } = render(<SystemSettingsLayout><ClassificationTypeEditor typeKey={null} /></SystemSettingsLayout>);
    await screen.findByText("New type");
    await expectApprovedLook(container, PLAN, "Add", `${SCREEN} → Add a type`);
  });

  it("Edit — a built-in type", async () => {
    nav.path = "/admin/settings/classification/INFORMATIONAL";
    answer(detail({}));
    const { container } = render(<SystemSettingsLayout><ClassificationTypeEditor typeKey="INFORMATIONAL" /></SystemSettingsLayout>);
    await screen.findByText("Built in, so it can be renamed but not removed.");
    await expectApprovedLook(container, PLAN, "Edit", `${SCREEN} → a built-in type`);
  });

  it("EditAdded — an added type no classification uses", async () => {
    nav.path = "/admin/settings/classification/k_careers";
    answer(detail({ key: "k_careers", nameEn: "Careers", builtIn: false, addedAt: Date.UTC(2026, 9, 15), classifications: 0, websites: 0 }));
    const { container } = render(<SystemSettingsLayout><ClassificationTypeEditor typeKey="k_careers" /></SystemSettingsLayout>);
    await screen.findByText("Remove type");
    await expectApprovedLook(container, PLAN, "EditAdded", `${SCREEN} → an added type`);
  });
});
