import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { answerQueries, convexPath } from "@/src/test/siteViewFixtures";
import CompanySiteSchedulesPage from "./page";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: "company_1", companyWebsiteId: "companyWebsite_1" }),
}));

/**
 * One website's Schedules (docs/plans/active/website-schedules-plan.md):
 * everything Hakken collects for it, each source with its own switch, then
 * when rankings are bought. Rebuilt 2026-10-15 from the approved drawing.
 */

const MONTHLY = JSON.stringify({ version: 2, kind: "recurring", cadence: "monthly", dayOfMonth: 1, timeLocal: "02:10", timezone: "Europe/Madrid" });
const DAILY = JSON.stringify({ version: 2, kind: "recurring", cadence: "daily", timeLocal: "04:00", timezone: "Europe/London" });

const source = (name: string, overrides: Record<string, unknown> = {}) => ({
  source: name,
  state: "NOT_CONNECTED",
  on: true,
  scheduled: true,
  intervalStr: DAILY,
  nextRunAt: null,
  lastCollectedAt: null,
  ...overrides,
});

/** An own website following its company, which is collecting; Search Console connected, the rest not. */
const owned = {
  companyId: "company_1",
  websiteId: "website_9",
  companyName: "Test Agency",
  host: "ourshop.com",
  owned: true,
  companyOn: true,
  companyIntervalStr: MONTHLY,
  rankings: {
    on: true,
    collecting: true,
    ownIntervalStr: null,
    intervalStr: MONTHLY,
    nextRunAt: Date.parse("2026-11-01T01:10:00Z"),
    lastCollectedAt: Date.parse("2026-10-01T01:10:00Z"),
    pairedWith: null,
  },
  sources: [
    source("SEARCH_CONSOLE", { state: "CONNECTED", nextRunAt: Date.parse("2026-10-16T03:00:00Z"), lastCollectedAt: Date.parse("2026-10-15T03:06:00Z") }),
    source("GOOGLE_ANALYTICS"),
    source("BING", { scheduled: false, intervalStr: null }),
    source("CLARITY"),
  ],
};

/** A competitor paired with the company's own ourshop.com: rankings only. */
const competitor = {
  ...owned,
  websiteId: "website_10",
  host: "rival.com",
  owned: false,
  rankings: { ...owned.rankings, pairedWith: { companyWebsiteId: "companyWebsite_7", displayHost: "ourshop.com" } },
  sources: [],
};

const t = (key: string) => `admin.siteView.schedulesPage.${key}`;
const rowOf = (name: string) => screen.getByText(t(`sources.names.${name}`)).closest("tr") as HTMLElement;

describe("a website's Schedules", () => {
  const setSchedule = vi.fn();
  const setPairing = vi.fn();
  const setSourceOn = vi.fn();
  const setRankingsOn = vi.fn();
  const impersonate = vi.fn();

  const answer = (data: unknown, extra: Record<string, unknown> = {}) =>
    vi.mocked(useQuery).mockImplementation(answerQueries({ "websiteSources:getWebsiteSources": data, ...extra }));

  beforeEach(() => {
    for (const fn of [setSchedule, setPairing, setSourceOn, setRankingsOn, impersonate]) fn.mockReset().mockResolvedValue(null);
    push.mockReset();
    answer(owned);
    vi.mocked(useMutation).mockImplementation(((reference: unknown) => {
      const name = convexPath(reference);
      if (name.endsWith("setCompanyWebsiteSchedule")) return setSchedule;
      if (name.endsWith("setTrackedPairing")) return setPairing;
      if (name.endsWith("setSourceOn")) return setSourceOn;
      if (name.endsWith("setRankingsOn")) return setRankingsOn;
      if (name.endsWith("impersonateCompany")) return impersonate;
      return vi.fn();
    }) as never);
  });

  it("lists every source with its status, its cost and its own switch or a way to connect it", async () => {
    renderWithProviders(<CompanySiteSchedulesPage />);

    expect(await screen.findByText(t("card.title"))).toBeInTheDocument();
    expect(within(rowOf("RANKINGS")).getByText(t("sources.status.collecting"))).toBeInTheDocument();
    expect(within(rowOf("RANKINGS")).getByText(t("sources.cost.paid"))).toBeInTheDocument();
    expect(within(rowOf("SEARCH_CONSOLE")).getByText(t("sources.status.collecting"))).toBeInTheDocument();
    expect(within(rowOf("SEARCH_CONSOLE")).getByText(t("sources.cost.free"))).toBeInTheDocument();
    expect(within(rowOf("GOOGLE_ANALYTICS")).getByText(t("sources.status.notConnected"))).toBeInTheDocument();
    expect(within(rowOf("GOOGLE_ANALYTICS")).queryByRole("switch")).not.toBeInTheDocument();
    // Bing's collector has no running schedule: said, not hidden.
    expect(within(rowOf("BING")).getByText(t("sources.status.notConnected"))).toBeInTheDocument();
    expect(screen.getAllByRole("switch")).toHaveLength(2);
    expect(screen.getByText(/schedulesPage.record/).closest("a")).toHaveAttribute("href", "/admin/websites/website_9");
  });

  it("switches a free source and the rankings at once, each on its own row", async () => {
    renderWithProviders(<CompanySiteSchedulesPage />);

    fireEvent.click(within(await screen.findByText(t("sources.names.SEARCH_CONSOLE")).then((el) => el.closest("tr") as HTMLElement)).getByRole("switch"));
    await waitFor(() => expect(setSourceOn).toHaveBeenCalledWith({ companyWebsiteId: "companyWebsite_1", source: "SEARCH_CONSOLE", on: false }));

    fireEvent.click(within(rowOf("RANKINGS")).getByRole("switch"));
    await waitFor(() => expect(setRankingsOn).toHaveBeenCalledWith({ companyWebsiteId: "companyWebsite_1", on: false }));
  });

  it("connects a source from inside the company's own workspace", async () => {
    renderWithProviders(<CompanySiteSchedulesPage />);

    fireEvent.click(within(await screen.findByText(t("sources.names.CLARITY")).then((el) => el.closest("tr") as HTMLElement)).getByRole("button", { name: t("sources.connect") }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/clarity/companyWebsite_1/connection"));
    expect(impersonate).toHaveBeenCalledWith({ companyId: "company_1" });
  });

  it("says a switched-off source is off and a lost connection must be made again", async () => {
    answer({ ...owned, sources: [source("SEARCH_CONSOLE", { state: "CONNECTED", on: false }), source("GOOGLE_ANALYTICS", { state: "CONNECT_AGAIN" })] });
    renderWithProviders(<CompanySiteSchedulesPage />);

    expect(within(await screen.findByText(t("sources.names.SEARCH_CONSOLE")).then((el) => el.closest("tr") as HTMLElement)).getByText(t("sources.status.off"))).toBeInTheDocument();
    expect(within(rowOf("SEARCH_CONSOLE")).getByRole("switch")).toHaveAttribute("aria-checked", "false");
    expect(within(rowOf("GOOGLE_ANALYTICS")).getByText(t("sources.status.connectAgain"))).toBeInTheDocument();
    expect(within(rowOf("GOOGLE_ANALYTICS")).getByRole("button", { name: t("sources.reconnect") })).toBeInTheDocument();
  });

  it("puts the company's switch first: off for all of it, with a way to its own Schedules", async () => {
    answer({ ...owned, companyOn: false, rankings: { ...owned.rankings, collecting: false, nextRunAt: null } });
    renderWithProviders(<CompanySiteSchedulesPage />);

    expect(within(await screen.findByText(t("sources.names.RANKINGS")).then((el) => el.closest("tr") as HTMLElement)).getByText(t("sources.status.companyOff"))).toBeInTheDocument();
    expect(screen.getByText(t("card.companyOff"))).toBeInTheDocument();
    expect(screen.getByText(t("card.openCompany")).closest("a")).toHaveAttribute("href", "/admin/companies/company_1/websites/schedules");
    expect(screen.getByText(t("card.nothingWhileOff"))).toBeInTheDocument();
  });

  it("saves the schedule alone: following the company stores none, and the switch is left as it is", async () => {
    renderWithProviders(<CompanySiteSchedulesPage />);

    expect((await screen.findByText(t("card.placeOnMarket"))).closest("a"))
      .toHaveAttribute("href", "/admin/companies/company_1/websites/site/companyWebsite_1/market");
    fireEvent.click(screen.getByRole("button", { name: /common\.save/ }));
    await waitFor(() => expect(setSchedule).toHaveBeenCalledWith({ id: "companyWebsite_1", refreshIntervalStr: undefined }));
    expect(setPairing).not.toHaveBeenCalled();
  });

  it("saves its own schedule once Its own is chosen", async () => {
    answer({ ...owned, rankings: { ...owned.rankings, ownIntervalStr: MONTHLY } });
    renderWithProviders(<CompanySiteSchedulesPage />);

    expect(await screen.findByRole("radio", { name: t("card.own") })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: /common\.save/ }));
    await waitFor(() => expect(setSchedule).toHaveBeenCalledTimes(1));
    const saved = setSchedule.mock.calls[0][0] as { refreshIntervalStr: string };
    expect(JSON.parse(saved.refreshIntervalStr)).toMatchObject({ cadence: "monthly", dayOfMonth: 1, timeLocal: "02:10" });
  });

  it("says rankings switched off, and offers no schedule while they are", async () => {
    answer({ ...owned, rankings: { ...owned.rankings, on: false, collecting: false, nextRunAt: null } });
    renderWithProviders(<CompanySiteSchedulesPage />);

    expect(await screen.findByText(t("card.off"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /common\.save/ })).not.toBeInTheDocument();
  });

  it("gives a competitor only its rankings, and what it is watched against in place of a schedule", async () => {
    answer(competitor, { "websiteAttachments:listCompanyOwnedWebsites": [{ companyWebsiteId: "companyWebsite_7", displayHost: "ourshop.com" }] });
    renderWithProviders(<CompanySiteSchedulesPage />);

    expect(await screen.findByText(t("card.pairLabel"))).toBeInTheDocument();
    expect(screen.queryByText(t("sources.names.SEARCH_CONSOLE"))).not.toBeInTheDocument();
    expect(screen.getByText(t("sources.noteCompetitor"))).toBeInTheDocument();
    expect(screen.getByText(t("card.changePair")).closest("a")).toHaveAttribute("href", "/admin/companies/company_1/websites/site/companyWebsite_7/schedules");

    // Paired, its day is its pair's: saving changes nothing of its own.
    fireEvent.click(screen.getByRole("button", { name: /common\.save/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /common\.save/ })).toBeEnabled());
    expect(setSchedule).not.toHaveBeenCalled();

    // Unpaired, it gets the same choice as an own website.
    fireEvent.change(screen.getByRole("combobox", { name: t("card.pairLabel") }), { target: { value: "" } });
    expect(screen.getByRole("radio", { name: t("card.sameAs") })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /common\.save/ }));
    await waitFor(() => expect(setPairing).toHaveBeenCalledWith({ id: "companyWebsite_1", againstCompanyWebsiteId: null }));
    await waitFor(() => expect(setSchedule).toHaveBeenCalledWith({ id: "companyWebsite_1", refreshIntervalStr: undefined }));
  });
});
