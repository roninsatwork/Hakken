import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { answerQueries, convexPath, ownedHeader, trackedHeader } from "@/src/test/siteViewFixtures";
import CompanySiteMarketPage from "./page";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () =>
  (await import("@/src/test/screenMocks")).nextNavigation({ id: "company_1", companyWebsiteId: "companyWebsite_1" }));

/** The website's own settings, as the place card reads them: watched from the default, the United Kingdom. */
const ownWebsite = {
  _id: "companyWebsite_1",
  _creationTime: 0,
  companyId: "company_1",
  websiteId: "website_9",
  host: "ourshop.com",
  displayHost: "ourshop.com",
  companyName: "Test Agency",
  pairedWith: null,
  companyIntervalStr: null,
  companyScheduleActive: false,
  effective: { active: false, intervalStr: null, source: "COMPANY", nextRunAt: null },
};

const T = "admin.siteView.market";

/**
 * A website's Market (docs/plans/active/search-console-plan.md §16): where it
 * trades — Search Console's countries, in the order added, up to its limit —
 * and where it is watched from, moved here from Schedules. Inputs only, one
 * Save for both.
 */
describe("a website's Market", () => {
  const saveCountries = vi.fn();
  const setLocation = vi.fn();

  const answer = (overrides: Record<string, unknown> = {}) => {
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "websiteClientView:getSiteHeader": ownedHeader,
      "searchConsoleCountries:searchConsoleMarket": { owned: true, countries: ["gbr", "irl"], limit: 3 },
      "websites:getCompanyWebsiteById": ownWebsite,
      ...overrides,
    }));
  };

  beforeEach(() => {
    saveCountries.mockReset().mockResolvedValue(null);
    setLocation.mockReset().mockResolvedValue(null);
    vi.mocked(useMutation).mockImplementation(((reference: unknown) => {
      const name = convexPath(reference);
      if (name.endsWith("setSearchConsoleCountries")) return saveCountries;
      if (name.endsWith("setCompanyWebsiteLocation")) return setLocation;
      return vi.fn();
    }) as never);
    answer();
  });

  const save = () => fireEvent.click(screen.getByRole("button", { name: `${T}.save` }));

  it("lists the website's countries by name, in the order added, with its limit and a way to change it", async () => {
    renderWithProviders(<CompanySiteMarketPage />);

    expect(await screen.findByText(`${T}.trades.title`)).toBeInTheDocument();
    const rows = screen.getAllByRole("row").map((row) => row.textContent);
    expect(rows[0]).toContain("United Kingdom");
    expect(rows[1]).toContain("Ireland");
    expect(screen.getByText(`${T}.trades.limit`)).toBeInTheDocument();
    expect(screen.getByText(`${T}.trades.changeLimit`).closest("a"))
      .toHaveAttribute("href", "/admin/companies/company_1/websites/site/companyWebsite_1/limits");
    // Nothing is past the limit, and nothing has changed yet.
    expect(screen.queryByText(`${T}.trades.pastLimit`)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: `${T}.save` })).toBeDisabled();
    // Search Console always opens on All countries: the drawing's "opens on this" is gone.
    expect(screen.queryByText(/opens on/i)).not.toBeInTheDocument();
  });

  it("offers only the countries not chosen, sorted by name, without Google's unknown country", async () => {
    renderWithProviders(<CompanySiteMarketPage />);

    const picker = await screen.findByLabelText(`${T}.trades.addLabel`);
    const offered = within(picker).getAllByRole("option").map((option) => (option as HTMLOptionElement).value);
    expect(offered[0]).toBe("");
    expect(offered).not.toContain("gbr");
    expect(offered).not.toContain("irl");
    expect(offered).not.toContain("zzz");
    expect(offered).toContain("usa");
    const names = within(picker).getAllByRole("option").slice(1).map((option) => option.textContent ?? "");
    expect(names).toEqual([...names].sort((left, right) => left.localeCompare(right, "en")));
  });

  it("adds and removes countries on the list, then saves the codes in their order", async () => {
    renderWithProviders(<CompanySiteMarketPage />);

    const add = await screen.findByRole("button", { name: `${T}.trades.add` });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByLabelText(`${T}.trades.addLabel`), { target: { value: "usa" } });
    fireEvent.click(add);
    expect(screen.getAllByRole("row").map((row) => row.textContent)).toEqual([
      expect.stringContaining("United Kingdom"),
      expect.stringContaining("Ireland"),
      expect.stringContaining("United States"),
    ]);
    // Once added, it is no longer offered.
    expect(within(screen.getByLabelText(`${T}.trades.addLabel`)).queryByRole("option", { name: "United States" })).not.toBeInTheDocument();

    // Remove the first: the United Kingdom.
    fireEvent.click(screen.getAllByRole("button", { name: `${T}.trades.remove` })[0]);
    expect(screen.getAllByRole("row").map((row) => row.textContent)).toEqual([
      expect.stringContaining("Ireland"),
      expect.stringContaining("United States"),
    ]);

    save();
    await waitFor(() => expect(saveCountries).toHaveBeenCalledWith({ companyWebsiteId: "companyWebsite_1", countries: ["irl", "usa"] }));
    // The place was not touched, so it is not sent.
    expect(setLocation).not.toHaveBeenCalled();
    expect(await screen.findByText(`${T}.saved`)).toBeInTheDocument();
  });

  it("marks the countries past the limit as not kept ready, and takes no more", async () => {
    answer({ "searchConsoleCountries:searchConsoleMarket": { owned: true, countries: ["gbr", "irl", "usa"], limit: 2 } });
    renderWithProviders(<CompanySiteMarketPage />);

    expect(await screen.findByText(`${T}.trades.over`)).toBeInTheDocument();
    const rows = screen.getAllByRole("row");
    expect(within(rows[0]).queryByText(`${T}.trades.pastLimit`)).not.toBeInTheDocument();
    expect(within(rows[1]).queryByText(`${T}.trades.pastLimit`)).not.toBeInTheDocument();
    expect(within(rows[2]).getByText(`${T}.trades.pastLimit`)).toBeInTheDocument();
    expect(screen.getByLabelText(`${T}.trades.addLabel`)).toBeDisabled();
    expect(screen.getByRole("button", { name: `${T}.trades.add` })).toBeDisabled();
  });

  it("says when there are no countries yet, and saves an emptied list", async () => {
    answer({ "searchConsoleCountries:searchConsoleMarket": { owned: true, countries: ["gbr"], limit: 3 } });
    renderWithProviders(<CompanySiteMarketPage />);

    fireEvent.click(await screen.findByRole("button", { name: `${T}.trades.remove` }));
    expect(screen.getByText(`${T}.trades.empty`)).toBeInTheDocument();
    save();
    await waitFor(() => expect(saveCountries).toHaveBeenCalledWith({ companyWebsiteId: "companyWebsite_1", countries: [] }));
  });

  it("saves where you watch from through the place setting, and nothing else", async () => {
    renderWithProviders(<CompanySiteMarketPage />);

    const place = await screen.findByRole("combobox", { name: `${T}.watch.title` });
    expect(place).toHaveValue("2826");
    fireEvent.change(place, { target: { value: "1006886" } });
    save();

    await waitFor(() => expect(setLocation).toHaveBeenCalledWith({
      companyWebsiteId: "companyWebsite_1",
      locationCode: 1006886,
      locationLabel: "London, England",
    }));
    expect(saveCountries).not.toHaveBeenCalled();
  });

  it("saves the default place as none, as Schedules did", async () => {
    answer({ "websites:getCompanyWebsiteById": { ...ownWebsite, locationCode: 1006925, locationLabel: "Leeds, England" } });
    renderWithProviders(<CompanySiteMarketPage />);

    fireEvent.change(await screen.findByRole("combobox", { name: `${T}.watch.title` }), { target: { value: "2826" } });
    save();
    await waitFor(() => expect(setLocation).toHaveBeenCalledWith({ companyWebsiteId: "companyWebsite_1", locationCode: null, locationLabel: null }));
  });

  it("shows why a save was refused", async () => {
    saveCountries.mockRejectedValue(new Error("This website keeps 3 countries ready."));
    renderWithProviders(<CompanySiteMarketPage />);

    fireEvent.change(await screen.findByLabelText(`${T}.trades.addLabel`), { target: { value: "usa" } });
    fireEvent.click(screen.getByRole("button", { name: `${T}.trades.add` }));
    save();
    expect(await screen.findByText(/keeps 3 countries ready/)).toBeInTheDocument();
    expect(screen.queryByText(`${T}.saved`)).not.toBeInTheDocument();
  });

  it("gives a competitor no Where it trades, but still a place to watch from", async () => {
    answer({
      "websiteClientView:getSiteHeader": { ...trackedHeader, pairedWith: null },
      "searchConsoleCountries:searchConsoleMarket": { owned: false, countries: [], limit: 3 },
      "websites:getCompanyWebsiteById": { ...ownWebsite, relationship: "TRACKED" },
    });
    renderWithProviders(<CompanySiteMarketPage />);

    expect(await screen.findByText(`${T}.watch.title`)).toBeInTheDocument();
    expect(screen.getByText(`${T}.descriptionCompetitor`)).toBeInTheDocument();
    expect(screen.queryByText(`${T}.trades.title`)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(`${T}.trades.addLabel`)).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: `${T}.watch.title` }), { target: { value: "1006654" } });
    save();
    await waitFor(() => expect(setLocation).toHaveBeenCalledWith({
      companyWebsiteId: "companyWebsite_1",
      locationCode: 1006654,
      locationLabel: "Birmingham, England",
    }));
    expect(saveCountries).not.toHaveBeenCalled();
  });

  it("tells a paired competitor it is watched from its pair's place, with nothing to set or save", async () => {
    answer({
      "websiteClientView:getSiteHeader": trackedHeader,
      "searchConsoleCountries:searchConsoleMarket": { owned: false, countries: [], limit: 3 },
      "websites:getCompanyWebsiteById": {
        ...ownWebsite,
        relationship: "TRACKED",
        pairedWith: { companyWebsiteId: "companyWebsite_9", websiteId: "website_9", displayHost: "ourshop.com", locationLabel: "Leeds, England" },
      },
    });
    renderWithProviders(<CompanySiteMarketPage />);

    expect(await screen.findByText(`${T}.watch.paired`)).toBeInTheDocument();
    expect(screen.getByText(`${T}.watch.pairMarket`).closest("a"))
      .toHaveAttribute("href", "/admin/companies/company_1/websites/site/companyWebsite_9/market");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `${T}.save` })).not.toBeInTheDocument();
  });
});
