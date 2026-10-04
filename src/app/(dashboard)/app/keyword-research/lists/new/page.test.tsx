import { act, fireEvent, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { SETUP, answerResearch } from "@/src/test/keywordResearchFixtures";
import { expectStandardFormScreen } from "@/src/test/standardFormScreen";
import NewResearchListPage from "./page";

const nav = vi.hoisted(() => ({ search: "", push: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
// The shared mock, with the values a wording is given written after its key.
vi.mock("next-intl", async () => {
  const base = (await import("@/src/test/screenMocks")).nextIntl();
  return {
    ...base,
    useTranslations: (namespace: string) => {
      const t = (key: string, values?: Record<string, unknown>) => [`${namespace}.${key}`, ...Object.values(values ?? {})].join(" ");
      return Object.assign(t, { rich: t, has: () => false });
    },
  };
});
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/keyword-research/lists/new",
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: nav.push, back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({}),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));

function open(setup: unknown = SETUP) {
  const mutation = answerResearch({ "keywordResearch:researchSetup": setup });
  render(<NewResearchListPage />);
  return { mutation };
}

/**
 * New list: its own page, never a pop-up (keyword-research-plan.md, board 7),
 * opened from Research lists or from a lookup with its keyword carried over.
 */
describe("the New list page", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    vi.mocked(useMutation).mockReset();
    nav.push.mockClear();
    nav.search = "";
  });

  it("names the list and its website, labels every box, and opens the new list on Save", async () => {
    const { mutation } = open();

    expectStandardFormScreen();
    expect(screen.getByRole("link", { name: "keywordResearch.listForm.back" })).toHaveAttribute("href", "/app/keyword-research");
    expect(screen.getByLabelText("keywordResearch.listForm.measuredAgainst")).toHaveValue("site_1");

    fireEvent.change(screen.getByLabelText("keywordResearch.listForm.name"), { target: { value: "  AI services " } });
    fireEvent.change(screen.getByLabelText("keywordResearch.listForm.measuredAgainst"), { target: { value: "" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /keywordResearch\.listForm\.save/ }));
    });

    expect(mutation("addToResearchList")).toHaveBeenCalledWith({ newList: { name: "AI services" }, items: [] });
    expect(nav.push).toHaveBeenCalledWith("/app/keyword-research/lists/list_new");
  });

  it("carries a lookup's keyword into the new list, measured against the lookup's website, and leads back to the lookup", async () => {
    nav.search = "keyword=web+design+agency&country=2826&lookup=lookup_1&site=site_2";
    const { mutation } = open();

    expect(screen.getByText("keywordResearch.listForm.newWithKeyword web design agency")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "web design agency" })).toHaveAttribute("href", "/app/keyword-research/lookup_1");
    expect(screen.getByLabelText("keywordResearch.listForm.measuredAgainst")).toHaveValue("site_2");

    fireEvent.change(screen.getByLabelText("keywordResearch.listForm.name"), { target: { value: "Dublin" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /keywordResearch\.listForm\.save/ }));
    });

    expect(mutation("addToResearchList")).toHaveBeenCalledWith({
      newList: { name: "Dublin", siteId: "site_2" },
      items: [{ keyword: "web design agency", locationCode: 2826 }],
    });
  });

  it("takes the keywords ticked on Keyword ideas or Start from a competitor, and leads back there", async () => {
    nav.search = "keyword=web+design+london&keyword=web+design+surrey&country=2826&site=site_1&back=%2Fapp%2Fkeyword-research%2Fcompetitor%2Frival_1%3Fsite%3Dsite_1";
    const { mutation } = open();

    expect(screen.getByText("keywordResearch.listForm.newWithKeywords 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "keywordResearch.listForm.backToCompetitor" })).toHaveAttribute("href", "/app/keyword-research/competitor/rival_1?site=site_1");

    fireEvent.change(screen.getByLabelText("keywordResearch.listForm.name"), { target: { value: "Surrey" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /keywordResearch\.listForm\.save/ }));
    });
    expect(mutation("addToResearchList")).toHaveBeenCalledWith({
      newList: { name: "Surrey", siteId: "site_1" },
      items: [{ keyword: "web design london", locationCode: 2826 }, { keyword: "web design surrey", locationCode: 2826 }],
    });
  });

  it("never leads back off Keyword research", () => {
    nav.search = "keyword=a&country=2826&back=https%3A%2F%2Fexample.com";
    open();

    expect(screen.getByRole("link", { name: "keywordResearch.listForm.back" })).toHaveAttribute("href", "/app/keyword-research");
  });

  it("tells a read-only account it cannot make lists, in place of the form", () => {
    open({ ...SETUP, canLookUp: false });

    expect(screen.getByText("keywordResearch.listForm.readOnly")).toBeInTheDocument();
    expect(screen.queryByLabelText("keywordResearch.listForm.name")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /keywordResearch\.listForm\.save/ })).not.toBeInTheDocument();
  });
});
