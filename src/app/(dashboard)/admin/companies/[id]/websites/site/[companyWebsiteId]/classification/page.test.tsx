import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { convexPath, ownedHeader, trackedHeader } from "@/src/test/siteViewFixtures";
import PageClassificationPage from "./page";

const { push, replace } = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () => ({
  ...(await import("@/src/test/screenMocks")).nextNavigation({ id: "company_1", companyWebsiteId: "companyWebsite_1" }),
  useRouter: () => ({ push, replace, back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: vi.fn(),
}));

const T = "admin.siteView.classification";
const base = "/admin/companies/company_1/websites/site/companyWebsite_1/classification";

const classifications = [
  { _id: "class_hub", name: "Content hub", type: "INFORMATIONAL" },
  { _id: "class_company", name: "Company", type: "COMPANY" },
];

const summary = {
  pages: 175, sorted: 157, notSorted: 18, cut: false, pagesRead: 10_000,
  classifications: 2, lines: 2, picks: 2, limits: { classifications: 25, lines: 100, picks: 1_000 },
};

const pagesData = {
  rows: [
    { page: "/hub/kapferer/", clicks: 414, sitemapFile: "content-hub-sitemap.xml", classificationId: "class_hub", how: "BY_LINE", line: { kind: "STARTS_WITH", value: "/hub/" }, underneath: null },
    { page: "/hub/brand-audit/", clicks: 27, sitemapFile: "content-hub-sitemap.xml", classificationId: "class_company", how: "BY_HAND", line: null, underneath: "class_hub" },
    { page: "/author/anthony/", clicks: 15, sitemapFile: null, classificationId: null, how: "NONE", line: null, underneath: null },
    { page: "/about-us/", clicks: 7, sitemapFile: "page-sitemap.xml", classificationId: "class_company", how: "BY_HAND", line: null, underneath: null },
  ],
  page: 1,
  totalPages: 12,
  total: 175,
  classifications,
  summary,
};

const listData = {
  classifications: [
    { ...classifications[0], pages: 58, byHand: 1, lines: [{ _id: "line_1", kind: "STARTS_WITH", value: "/hub/" }] },
    { ...classifications[1], pages: 3, byHand: 2, lines: [] },
  ],
  summary,
};

/**
 * A website's Page classification (docs/plans/active/page-groups-plan.md,
 * decision 6): two views of one page. Pages — each page's classification set
 * in its row, removed with the bin, several set at once; Classifications —
 * each opening its own page, removed after a yes.
 */
describe("a website's Page classification", () => {
  const setClassification = vi.fn();
  const removeFromPage = vi.fn();
  const removeClassification = vi.fn();
  const suggest = vi.fn();
  let queried: Array<{ name: string; args: unknown }> = [];

  const answer = (overrides: Record<string, unknown> = {}) => {
    const answers: Record<string, unknown> = {
      "websiteClientView:getSiteHeader": ownedHeader,
      "pageClassifications:pageClassificationPages": pagesData,
      "pageClassifications:pageClassificationList": listData,
      ...overrides,
    };
    vi.mocked(useQuery).mockImplementation(((reference: unknown, args: unknown) => {
      if (args === "skip") return undefined;
      const name = convexPath(reference);
      queried.push({ name, args });
      const match = Object.keys(answers).find((suffix) => name.endsWith(suffix));
      return match ? answers[match] : undefined;
    }) as never);
  };
  const lastArgs = (suffix: string) => queried.filter((call) => call.name.endsWith(suffix)).at(-1)?.args;
  const view = (search: string) => vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams(search) as never);
  const rowOf = (page: string) => screen.getByText(page).closest("tr") as HTMLElement;

  beforeEach(() => {
    queried = [];
    push.mockClear();
    replace.mockClear();
    setClassification.mockReset().mockResolvedValue({ set: 1 });
    removeFromPage.mockReset().mockResolvedValue({ classificationId: null, how: "TAKEN_OUT" });
    removeClassification.mockReset().mockResolvedValue({ lines: 1, pagesByHand: 1 });
    suggest.mockReset().mockResolvedValue({ created: 4, names: ["Content hub", "Journal", "Insights", "Case studies"], overLimit: 0 });
    vi.mocked(useMutation).mockImplementation(((reference: unknown) => {
      const name = convexPath(reference);
      if (name.endsWith("setPageClassification")) return setClassification;
      if (name.endsWith("removeClassificationFromPage")) return removeFromPage;
      if (name.endsWith("removePageClassification")) return removeClassification;
      if (name.endsWith("suggestPageClassifications")) return suggest;
      return vi.fn();
    }) as never);
    view("");
    answer();
  });

  it("opens on the Pages view: its counts, and each page with its classification and how it's set", () => {
    renderWithProviders(<PageClassificationPage />);

    expect(screen.getByText("admin.websitesSection.pages.classification")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: `${T}.views.pages` })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: `${T}.views.classifications` })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(`${T}.notice`)).toBeInTheDocument();
    expect(lastArgs("pageClassificationPages")).toEqual({ companyWebsiteId: "companyWebsite_1", search: undefined, classification: undefined, page: 1, rows: 15 });

    expect(within(rowOf("/hub/kapferer/")).getByRole("combobox")).toHaveValue("class_hub");
    expect(within(rowOf("/hub/kapferer/")).getByText(`${T}.how.BY_LINE`)).toBeInTheDocument();
    expect(within(rowOf("/hub/brand-audit/")).getByText(`${T}.how.BY_HAND`)).toBeInTheDocument();
    expect(within(rowOf("/hub/kapferer/")).getByText("414")).toBeInTheDocument();
    // Not sorted says so in its select, and has nothing to remove.
    const notSorted = within(rowOf("/author/anthony/")).getByRole("combobox");
    expect(notSorted).toHaveValue("");
    expect(within(notSorted).getAllByRole("option")[0]).toHaveTextContent(`${T}.chooseNotSorted`);
    expect(within(rowOf("/author/anthony/")).queryByRole("button")).not.toBeInTheDocument();
    // One orange action: Add classification, which opens a page of its own.
    fireEvent.click(screen.getByRole("button", { name: `${T}.add` }));
    expect(push).toHaveBeenCalledWith(`${base}/new`);
  });

  it("sets a page's classification from the select in its row", async () => {
    renderWithProviders(<PageClassificationPage />);

    fireEvent.change(within(rowOf("/author/anthony/")).getByRole("combobox"), { target: { value: "class_hub" } });
    await waitFor(() => expect(setClassification).toHaveBeenCalledWith({
      companyWebsiteId: "companyWebsite_1", classificationId: "class_hub", pages: ["/author/anthony/"],
    }));
    // Changing one already set sets it by hand.
    fireEvent.change(within(rowOf("/hub/kapferer/")).getByRole("combobox"), { target: { value: "class_company" } });
    await waitFor(() => expect(setClassification).toHaveBeenLastCalledWith({
      companyWebsiteId: "companyWebsite_1", classificationId: "class_company", pages: ["/hub/kapferer/"],
    }));
  });

  it("removes a page's classification with the bin, whose tooltip says what removing does", async () => {
    renderWithProviders(<PageClassificationPage />);

    // Given by a line: taken out of it. Set by hand over a line: back to the line. Set by hand alone: Not sorted.
    expect(within(rowOf("/hub/kapferer/")).getByRole("button", { name: `${T}.removeTakeOut` })).toHaveAttribute("title", `${T}.removeTakeOut`);
    expect(within(rowOf("/hub/brand-audit/")).getByRole("button", { name: `${T}.removeBackTo` })).toBeInTheDocument();
    expect(within(rowOf("/about-us/")).getByRole("button", { name: `${T}.removeNotSorted` })).toBeInTheDocument();

    fireEvent.click(within(rowOf("/hub/kapferer/")).getByRole("button", { name: `${T}.removeTakeOut` }));
    await waitFor(() => expect(removeFromPage).toHaveBeenCalledWith({ companyWebsiteId: "companyWebsite_1", page: "/hub/kapferer/" }));
  });

  it("shows why a page's classification could not be set", async () => {
    setClassification.mockRejectedValue(new Error('This website can have 250 pages set by hand. Raise "Pages set by hand per website" on its Limits page.'));
    renderWithProviders(<PageClassificationPage />);

    fireEvent.change(within(rowOf("/author/anthony/")).getByRole("combobox"), { target: { value: "class_hub" } });
    expect(await screen.findByText(/Pages set by hand per website/)).toBeInTheDocument();
  });

  it("ticking several shows the bar for them, and sets them together", async () => {
    renderWithProviders(<PageClassificationPage />);
    expect(screen.queryByText(`${T}.bulk.ticked`)).not.toBeInTheDocument();

    fireEvent.click(within(rowOf("/author/anthony/")).getByRole("checkbox"));
    fireEvent.click(within(rowOf("/about-us/")).getByRole("checkbox"));
    expect(screen.getByText(`${T}.bulk.ticked`)).toBeInTheDocument();
    const set = screen.getByRole("button", { name: `${T}.bulk.set` });
    // Nothing chosen yet.
    expect(set).toBeDisabled();

    fireEvent.change(screen.getByRole("combobox", { name: `${T}.bulk.label` }), { target: { value: "class_hub" } });
    fireEvent.click(set);
    await waitFor(() => expect(setClassification).toHaveBeenCalledWith({
      companyWebsiteId: "companyWebsite_1", classificationId: "class_hub", pages: ["/author/anthony/", "/about-us/"],
    }));
    // Set: the ticks go, and the bar with them.
    await waitFor(() => expect(screen.queryByText(`${T}.bulk.ticked`)).not.toBeInTheDocument());
  });

  it("unticks all from the bar", () => {
    renderWithProviders(<PageClassificationPage />);

    fireEvent.click(within(rowOf("/author/anthony/")).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: `${T}.bulk.untick` }));
    expect(screen.queryByText(`${T}.bulk.ticked`)).not.toBeInTheDocument();
    expect(within(rowOf("/author/anthony/")).getByRole("checkbox")).not.toBeChecked();
  });

  it("shows the pages not sorted from the notice, through the Classification chip", () => {
    renderWithProviders(<PageClassificationPage />);

    fireEvent.click(screen.getByRole("button", { name: `${T}.showNotSorted` }));
    expect(lastArgs("pageClassificationPages")).toMatchObject({ classification: "NOT_SORTED", page: 1 });
    expect(screen.getByRole("combobox", { name: `${T}.filter` })).toHaveValue("NOT_SORTED");

    fireEvent.change(screen.getByRole("combobox", { name: `${T}.filter` }), { target: { value: "class_company" } });
    expect(lastArgs("pageClassificationPages")).toMatchObject({ classification: "class_company" });
  });

  it("switches to the Classifications view, kept in the address", () => {
    renderWithProviders(<PageClassificationPage />);

    fireEvent.click(screen.getByRole("radio", { name: `${T}.views.classifications` }));
    expect(replace).toHaveBeenCalledWith(`${base}?view=classifications`);
  });

  it("lists each classification with its type, pages and lines; the pencil opens its own page", () => {
    view("view=classifications");
    renderWithProviders(<PageClassificationPage />);

    expect(screen.getByRole("radio", { name: `${T}.views.classifications` })).toHaveAttribute("aria-checked", "true");
    // Only the view on screen is asked for.
    expect(lastArgs("pageClassificationPages")).toBeUndefined();
    const hub = rowOf("Content hub");
    expect(within(hub).getByText(`${T}.types.INFORMATIONAL`)).toBeInTheDocument();
    expect(within(hub).getByText("58")).toBeInTheDocument();
    expect(within(hub).getByText(`${T}.kindsInline.STARTS_WITH /hub/`)).toBeInTheDocument();
    expect(within(rowOf("Company")).getByText(`${T}.list.byHandOnly`)).toBeInTheDocument();

    fireEvent.click(within(hub).getByRole("button", { name: `${T}.list.edit` }));
    expect(push).toHaveBeenCalledWith(`${base}/class_hub`);
  });

  it("removes a classification only after a yes", async () => {
    view("view=classifications");
    renderWithProviders(<PageClassificationPage />);

    fireEvent.click(within(rowOf("Content hub")).getByRole("button", { name: `${T}.list.remove` }));
    expect(removeClassification).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(`${T}.remove.body`)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: `${T}.remove.confirm` }));
    await waitFor(() => expect(removeClassification).toHaveBeenCalledWith({ companyWebsiteId: "companyWebsite_1", classificationId: "class_hub" }));
  });

  it("says when there are no classifications yet, and holds Add classification at the limit", () => {
    answer({
      "pageClassifications:pageClassificationPages": {
        ...pagesData,
        classifications: [],
        summary: { ...summary, classifications: 25, limits: { ...summary.limits, classifications: 25 } },
      },
    });
    renderWithProviders(<PageClassificationPage />);

    expect(screen.getByRole("button", { name: `${T}.add` })).toBeDisabled();
    expect(screen.getByRole("button", { name: `${T}.add` }).closest("span")).toHaveAttribute("title", `${T}.addFullTip`);
  });

  it("gives a competitor no classifications", () => {
    answer({ "websiteClientView:getSiteHeader": trackedHeader });
    renderWithProviders(<PageClassificationPage />);

    expect(screen.getByText(`${T}.competitor`)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `${T}.add` })).not.toBeInTheDocument();
    expect(lastArgs("pageClassificationPages")).toBeUndefined();
  });

  it("counts the classifications above their table", () => {
    view("view=classifications");
    renderWithProviders(<PageClassificationPage />);

    expect(screen.getByText("ui.tableBar.classifications")).toBeInTheDocument();
    // A website that has classifications is offered no suggested start.
    expect(screen.queryByRole("button", { name: `${T}.suggest.button` })).not.toBeInTheDocument();
  });

  it("offers the suggested start while the website has none, and makes them in one press", async () => {
    view("view=classifications");
    answer({ "pageClassifications:pageClassificationList": { classifications: [], summary: { ...summary, classifications: 0, sorted: 0, notSorted: 175 } } });
    renderWithProviders(<PageClassificationPage />);

    expect(screen.getByText(`${T}.suggest.notice`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `${T}.suggest.button` }));
    await waitFor(() => expect(suggest).toHaveBeenCalledWith({ companyWebsiteId: "companyWebsite_1" }));
    expect(await screen.findByText(`${T}.suggest.created`)).toBeInTheDocument();
  });

  it("offers no suggested start before the website has any pages", () => {
    view("view=classifications");
    answer({ "pageClassifications:pageClassificationList": { classifications: [], summary: { ...summary, pages: 0, classifications: 0, sorted: 0, notSorted: 0 } } });
    renderWithProviders(<PageClassificationPage />);

    expect(screen.queryByText(`${T}.suggest.notice`)).not.toBeInTheDocument();
  });
});
