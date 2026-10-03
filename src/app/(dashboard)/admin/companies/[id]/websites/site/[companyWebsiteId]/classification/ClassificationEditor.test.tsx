import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { convexPath, ownedHeader } from "@/src/test/siteViewFixtures";
import { ClassificationEditor } from "./ClassificationEditor";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () => ({
  ...(await import("@/src/test/screenMocks")).nextNavigation({ id: "company_1", companyWebsiteId: "companyWebsite_1" }),
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

const T = "admin.siteView.classification";
const E = `${T}.edit`;
const listHref = "/admin/companies/company_1/websites/site/companyWebsite_1/classification?view=classifications";

const saved = { _id: "class_hub", name: "Content hub", type: "INFORMATIONAL", lines: [{ _id: "line_1", kind: "STARTS_WITH", value: "/hub/" }] };

type Line = { kind: string; value: string };

/** What the server says of the lines as edited: "starts with /" can't be kept; each other line catches 29 pages. */
const previewOf = (lines: Line[]) => ({
  rows: [
    { page: "/hub/kapferer/", clicks: 414, how: "BY_LINE", line: { kind: "STARTS_WITH", value: "/hub/" } },
    { page: "/author/anthony/", clicks: 15, how: "BY_HAND", line: null },
  ],
  total: 30,
  byHand: 1,
  lines: lines.map((line) => (line.kind === "STARTS_WITH" && line.value === "/"
    ? { catches: 0, problem: "EVERY_PAGE", on: null }
    : { catches: 29, problem: null, on: null })),
  cut: false,
});

/**
 * A classification's own page (page-groups-plan.md, decision 6, board 22b):
 * its name and type, its lines with what each catches, its pages as the lines
 * read before anything is saved, one Save, and Remove after a yes. A page,
 * never a pop-up, since it has fields.
 */
describe("a classification's own page", () => {
  const create = vi.fn();
  const update = vi.fn();
  const removeClassification = vi.fn();
  let previews: Line[][] = [];

  const answer = (overrides: Record<string, unknown> = {}) => {
    const answers: Record<string, unknown> = {
      "websiteClientView:getSiteHeader": ownedHeader,
      "pageClassifications:pageClassificationDetail": saved,
      ...overrides,
    };
    vi.mocked(useQuery).mockImplementation(((reference: unknown, args: unknown) => {
      if (args === "skip") return undefined;
      const name = convexPath(reference);
      if (name.endsWith("pageClassificationPreview")) {
        const lines = (args as { lines: Line[] }).lines;
        previews.push(lines);
        return previewOf(lines);
      }
      const match = Object.keys(answers).find((suffix) => name.endsWith(suffix));
      return match ? answers[match] : undefined;
    }) as never);
  };
  const lastPreview = () => previews.at(-1);
  const linesCard = () => screen.getByText(`${E}.whichPages`).closest("section") as HTMLElement;

  beforeEach(() => {
    previews = [];
    push.mockClear();
    create.mockReset().mockResolvedValue("class_new");
    update.mockReset().mockResolvedValue(null);
    removeClassification.mockReset().mockResolvedValue({ lines: 1, pagesByHand: 1 });
    vi.mocked(useMutation).mockImplementation(((reference: unknown) => {
      const name = convexPath(reference);
      if (name.endsWith("createPageClassification")) return create;
      if (name.endsWith("updatePageClassification")) return update;
      if (name.endsWith("removePageClassification")) return removeClassification;
      return vi.fn();
    }) as never);
    answer();
  });

  const renderSaved = () => renderWithProviders(
    <ClassificationEditor companyId={"company_1" as never} companyWebsiteId={"companyWebsite_1" as never} classificationId={"class_hub" as never} />,
  );

  it("shows its name, type and lines, what each line catches, and its pages as the lines read", () => {
    renderSaved();

    expect(screen.getByRole("link", { name: `${E}.back` })).toHaveAttribute("href", listHref);
    expect(screen.getByLabelText(`${E}.name`)).toHaveValue("Content hub");
    expect(screen.getByLabelText(`${E}.type`)).toHaveValue("INFORMATIONAL");
    const line = within(linesCard()).getAllByRole("row")[0];
    expect(line).toHaveTextContent(`${T}.kinds.STARTS_WITH`);
    expect(line).toHaveTextContent("/hub/");
    expect(line).toHaveTextContent(`${E}.catches`);
    expect(lastPreview()).toEqual([{ kind: "STARTS_WITH", value: "/hub/" }]);

    const pages = screen.getByText(`${E}.itsPages`).closest("section") as HTMLElement;
    expect(within(pages).getByText("/hub/kapferer/")).toBeInTheDocument();
    expect(within(pages).getByText(`${T}.kindsInline.STARTS_WITH /hub/`)).toBeInTheDocument();
    expect(within(pages).getByText(`${E}.byHand`)).toBeInTheDocument();
    // 30 in all, two listed.
    expect(within(pages).getByText(`${E}.more`)).toBeInTheDocument();
    // Nothing changed yet.
    expect(screen.getByRole("button", { name: `${E}.save` })).toBeDisabled();
  });

  it("adds and removes lines, and its pages follow them before anything is saved", () => {
    renderSaved();

    fireEvent.change(screen.getByLabelText(`${E}.kindLabel`), { target: { value: "CONTAINS" } });
    fireEvent.change(screen.getByLabelText(`${E}.valueLabel`), { target: { value: " brand " } });
    fireEvent.click(screen.getByRole("button", { name: `${E}.addLine` }));
    expect(lastPreview()).toEqual([{ kind: "STARTS_WITH", value: "/hub/" }, { kind: "CONTAINS", value: "brand" }]);
    expect(within(linesCard()).getByText("brand")).toBeInTheDocument();
    expect(screen.getByLabelText(`${E}.valueLabel`)).toHaveValue("");

    // A line that can't be kept says why, beside it.
    fireEvent.change(screen.getByLabelText(`${E}.kindLabel`), { target: { value: "STARTS_WITH" } });
    fireEvent.change(screen.getByLabelText(`${E}.valueLabel`), { target: { value: "/" } });
    fireEvent.keyDown(screen.getByLabelText(`${E}.valueLabel`), { key: "Enter" });
    expect(within(linesCard()).getByText(`${E}.problems.EVERY_PAGE`)).toBeInTheDocument();

    fireEvent.click(within(linesCard()).getAllByRole("button", { name: `${E}.removeLine` })[0]);
    expect(lastPreview()).toEqual([{ kind: "CONTAINS", value: "brand" }, { kind: "STARTS_WITH", value: "/" }]);
  });

  it("saves its name, type and lines together", async () => {
    renderSaved();

    fireEvent.change(screen.getByLabelText(`${E}.name`), { target: { value: "Hub" } });
    fireEvent.change(screen.getByLabelText(`${E}.type`), { target: { value: "SERVICE" } });
    fireEvent.change(screen.getByLabelText(`${E}.valueLabel`), { target: { value: "/guides/" } });
    fireEvent.click(screen.getByRole("button", { name: `${E}.addLine` }));
    fireEvent.click(screen.getByRole("button", { name: `${E}.save` }));

    await waitFor(() => expect(update).toHaveBeenCalledWith({
      companyWebsiteId: "companyWebsite_1",
      classificationId: "class_hub",
      name: "Hub",
      type: "SERVICE",
      lines: [{ kind: "STARTS_WITH", value: "/hub/" }, { kind: "STARTS_WITH", value: "/guides/" }],
    }));
    expect(await screen.findByText(`${E}.saved`)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("shows why a save was refused", async () => {
    update.mockRejectedValue(new Error('This website\'s classifications can have 100 address lines in all. Raise "Address lines per website" on its Limits page.'));
    renderSaved();

    fireEvent.change(screen.getByLabelText(`${E}.name`), { target: { value: "Hub" } });
    fireEvent.click(screen.getByRole("button", { name: `${E}.save` }));
    expect(await screen.findByText(/Address lines per website/)).toBeInTheDocument();
    expect(screen.queryByText(`${E}.saved`)).not.toBeInTheDocument();
  });

  it("removes it only after a yes, then goes back to the list", async () => {
    renderSaved();

    fireEvent.click(screen.getByRole("button", { name: `${E}.remove` }));
    expect(removeClassification).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: `${T}.remove.confirm` }));
    await waitFor(() => expect(removeClassification).toHaveBeenCalledWith({ companyWebsiteId: "companyWebsite_1", classificationId: "class_hub" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(listHref));
  });

  it("adds a new one on its own page, then goes back to the list", async () => {
    renderWithProviders(
      <ClassificationEditor companyId={"company_1" as never} companyWebsiteId={"companyWebsite_1" as never} classificationId={null} />,
    );

    expect(screen.getByText(`${E}.newTitle`)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `${E}.remove` })).not.toBeInTheDocument();
    const add = screen.getByRole("button", { name: `${E}.create` });
    // A name first.
    expect(add).toBeDisabled();
    expect(lastPreview()).toEqual([]);

    fireEvent.change(screen.getByLabelText(`${E}.name`), { target: { value: "Journal" } });
    fireEvent.change(screen.getByLabelText(`${E}.kindLabel`), { target: { value: "SITEMAP_FILE" } });
    fireEvent.change(screen.getByLabelText(`${E}.valueLabel`), { target: { value: "post-sitemap.xml" } });
    fireEvent.click(screen.getByRole("button", { name: `${E}.addLine` }));
    fireEvent.click(add);

    await waitFor(() => expect(create).toHaveBeenCalledWith({
      companyWebsiteId: "companyWebsite_1", name: "Journal", type: "OTHER", lines: [{ kind: "SITEMAP_FILE", value: "post-sitemap.xml" }],
    }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(listHref));
  });

  it("says when the classification is no longer there", () => {
    answer({ "pageClassifications:pageClassificationDetail": null });
    renderSaved();

    expect(screen.getByText(`${E}.notFound`)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `${E}.save` })).not.toBeInTheDocument();
  });
});
