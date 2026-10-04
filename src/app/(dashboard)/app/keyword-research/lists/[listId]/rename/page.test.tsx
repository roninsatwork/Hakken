import { act, fireEvent, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { LIST, answerResearch } from "@/src/test/keywordResearchFixtures";
import { expectStandardFormScreen } from "@/src/test/standardFormScreen";
import RenameResearchListPage from "./page";

const nav = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
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
  usePathname: () => "/app/keyword-research/lists/list_1/rename",
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ replace: vi.fn(), push: nav.push, back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ listId: "list_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));

/** Renaming a research list: a name is a field, so its own page with a way back, never a pop-up. */
describe("the Rename list page", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    vi.mocked(useMutation).mockReset();
    nav.push.mockClear();
  });

  it("opens on the list's name, saves the new one and returns to the list", async () => {
    const mutation = answerResearch({ "keywordResearch:researchList": LIST });
    render(<RenameResearchListPage />);

    expectStandardFormScreen();
    expect(screen.getByRole("link", { name: "Web design – London" })).toHaveAttribute("href", "/app/keyword-research/lists/list_1");
    const name = screen.getByLabelText("keywordResearch.listForm.name");
    expect(name).toHaveValue("Web design – London");
    // A list keeps the website it is measured against.
    expect(screen.queryByLabelText("keywordResearch.listForm.measuredAgainst")).not.toBeInTheDocument();

    fireEvent.change(name, { target: { value: "Web design – Surrey" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /keywordResearch\.listForm\.save/ }));
    });

    expect(mutation("renameResearchList")).toHaveBeenCalledWith({ listId: "list_1", name: "Web design – Surrey" });
    expect(nav.push).toHaveBeenCalledWith("/app/keyword-research/lists/list_1");
  });

  it("tells a read-only account it cannot rename, in place of the form", () => {
    answerResearch({ "keywordResearch:researchList": { ...LIST, canChange: false } });
    render(<RenameResearchListPage />);

    expect(screen.getByText("keywordResearch.listForm.readOnly")).toBeInTheDocument();
    expect(screen.queryByLabelText("keywordResearch.listForm.name")).not.toBeInTheDocument();
  });
});
