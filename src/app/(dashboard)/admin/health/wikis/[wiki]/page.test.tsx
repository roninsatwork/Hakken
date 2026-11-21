import { screen } from "@testing-library/react";
import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { routeParams } from "@/src/test/routeParams";
import HealthWikiCheckupPage from "./page";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(() => undefined),
  useMutation: vi.fn(() => vi.fn()),
}));

const health = [
  { companyId: "company_harbour", name: "Harbour Foods", state: "OK", lastFinishedAt: null, summary: null, error: null },
];

const asked: Array<{ name: string; args: unknown }> = [];

/**
 * A wiki's Check-up opened from Health, Wiki check-ups (S8): titled with the
 * wiki's name, a way back to the list, and the right wiki's check-up.
 */
describe("Health, one wiki's Check-up", () => {
  beforeEach(() => {
    asked.length = 0;
    vi.mocked(useMutation).mockImplementation(() => vi.fn() as never);
    vi.mocked(useQuery).mockImplementation(((fn: unknown, args: unknown) => {
      const name = getFunctionName(fn as never);
      if (args !== "skip") asked.push({ name, args });
      if (name === "wikiCheckup:listCheckupHealth") return health;
      if (name.startsWith("wikiCheckup:getLatestCheckupFor")) return null;
      return undefined;
    }) as never);
  });

  it("names the company's wiki, leads back to the list and reads that company's check-up", () => {
    render(<HealthWikiCheckupPage params={routeParams({ wiki: "company_harbour" })} />);

    expect(screen.getByRole("heading", { name: "Harbour Foods" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Wiki check-ups" })).toHaveAttribute("href", "/admin/health/wikis");
    expect(asked).toContainEqual({ name: "wikiCheckup:getLatestCheckupForCompany", args: { companyId: "company_harbour" } });
    expect(asked.map((call) => call.name)).not.toContain("wikiCheckup:getLatestCheckupForGlobal");
  });

  it("opens the Platform Wiki's check-up without reading the list", () => {
    render(<HealthWikiCheckupPage params={routeParams({ wiki: "platform" })} />);

    expect(screen.getByRole("heading", { name: "Platform Wiki" })).toBeInTheDocument();
    expect(asked.map((call) => call.name)).toEqual(["wikiCheckup:getLatestCheckupForGlobal"]);
  });
});
