import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { beforeEach, describe, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { answerQueries } from "@/src/test/siteViewFixtures";
import { ownedHeader } from "@/src/test/siteViewFixtures";
import PageClassificationPage from "./page";
import { ClassificationEditor } from "./ClassificationEditor";

/**
 * Page classification with Auto Classify holds to the look Anthony approved
 * on the "Page classification — Auto Classify" canvas, 2026-10-16
 * (docs/plans/active/auto-classify-plan.md; design-drift-plan D4): boards
 * Main (the Auto Classify button beside the unclassified), Sorting (its
 * progress, the chip on Sorted by Auto Classify) and Hinges (a group's own
 * page with its description).
 */

vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/companies/company_1/websites/site/companyWebsite_1/classification",
  useSearchParams: () => new URLSearchParams(""),
  useParams: () => ({ id: "company_1", companyWebsiteId: "companyWebsite_1" }),
}));

const classifications = [
  { _id: "class_hinges", name: "Hinges", type: "PRODUCT" },
  { _id: "class_brand", name: "Brand", type: "COMPANY" },
];
const summary = {
  pages: 10_000, sorted: 1_626, notSorted: 8_374, cut: true, pagesRead: 10_000,
  classifications: 10, lines: 9, picks: 6, limits: { classifications: 25, lines: 100, picks: 1_000 },
};
const rows = [
  { page: "/", clicks: 499, sitemapFile: null, classificationId: "class_brand", how: "BY_HAND", line: null, certainty: null, underneath: null },
  { page: "/hinges/specialist-hinges.html", clicks: 53, sitemapFile: null, classificationId: "class_hinges", how: "BY_LINE", line: { kind: "STARTS_WITH", value: "/hinges/" }, certainty: null, underneath: null },
];
const sortedRows = [
  { page: "/hinges.html", clicks: 20, sitemapFile: null, classificationId: "class_hinges", how: "BY_AUTO", line: null, certainty: "SURE", underneath: null },
  { page: "/contact", clicks: 32, sitemapFile: null, classificationId: "class_brand", how: "BY_AUTO", line: null, certainty: "SURE", underneath: null },
];
const types = [{ key: "PRODUCT", name: "Product" }, { key: "COMPANY", name: "Company" }];

function answer(overrides: Record<string, unknown>) {
  vi.mocked(useQuery).mockImplementation(answerQueries({
    "websiteClientView:getSiteHeader": ownedHeader,
    "classificationTypes:classificationTypeChoices": types,
    "pageClassifications:pageClassificationPages": { rows, page: 1, totalPages: 667, total: 10_000, classifications, summary },
    "autoClassifyStart:autoClassifyStatus": { readiness: "ON", groupsLeftOut: 0, run: null },
    ...overrides,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useMutation).mockImplementation((() => vi.fn(async () => null)) as never);
});

describe("Page classification with Auto Classify", () => {
  it("offers Auto Classify beside the unclassified pages, as drawn (board Main)", async () => {
    answer({});
    const { container } = render(<PageClassificationPage />);
    await screen.findByRole("button", { name: "Auto Classify" });
    await expectApprovedLook(container, "auto-classify", "Main", "Page classification");
  });

  it("shows its progress while it sorts, the chip on Sorted by Auto Classify, as drawn (board Sorting)", async () => {
    answer({
      "pageClassifications:pageClassificationPages": { rows: sortedRows, page: 1, totalPages: 143, total: 2_140, classifications, summary },
      "autoClassifyStart:autoClassifyStatus": {
        readiness: "ON", groupsLeftOut: 0,
        run: { status: "SORTING", total: 8_374, done: 2_140, placed: 1_980, startedAt: 1, lastStepAt: 2, finishedAt: null, stopped: null },
      },
    });
    const { container } = render(<PageClassificationPage />);
    await screen.findByText(/Auto Classify is sorting the unclassified pages/);
    await expectApprovedLook(container, "auto-classify", "Sorting", "Page classification, sorting");
  });

  it("gives a classification its description, as drawn (board Hinges)", async () => {
    answer({
      "pageClassifications:pageClassificationDetail": {
        _id: "class_hinges", name: "Hinges", type: "PRODUCT",
        description: "Pages for hinges and hinge packs.", descriptionBy: "HAKKEN",
        lines: [{ _id: "line_1", kind: "STARTS_WITH", value: "/hinges/" }],
      },
      "pageClassifications:pageClassificationPreview": {
        rows: [
          { page: "/hinges/specialist-hinges.html", clicks: 53, how: "BY_LINE", line: { kind: "STARTS_WITH", value: "/hinges/" }, certainty: null },
          { page: "/hinges.html", clicks: 20, how: "BY_AUTO", line: null, certainty: "SURE" },
        ],
        total: 568, byHand: 0, lines: [{ catches: 163, problem: null, on: null }], cut: true,
      },
    });
    const { container } = render(<ClassificationEditor companyId={"company_1" as never} companyWebsiteId={"companyWebsite_1" as never} classificationId={"class_hinges" as never} />);
    await screen.findByDisplayValue("Pages for hinges and hinge packs.");
    await expectApprovedLook(container, "auto-classify", "Hinges", "A classification's own page");
  });
});
