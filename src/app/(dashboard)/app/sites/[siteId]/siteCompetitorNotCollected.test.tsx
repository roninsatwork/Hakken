import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import SiteAuditPage from "./audit/page";
import SiteAllBacklinksPage from "./backlinks/all/page";
import SiteBrokenBacklinksPage from "./backlinks/broken/page";
import SiteLinksNewLostPage from "./backlinks/new-lost/page";
import SiteAnchorsPage from "./backlinks/anchors/page";
import SiteReferringIpsPage from "./backlinks/ips/page";
import SiteOrganicCompetitorsPage from "./competitors/organic/page";
import SiteKeywordsPage from "./keywords/page";

/**
 * What a competitor's screens say about what is not collected for it
 * (docs/plans/active/finish-off-plan.md, items 6, 7 and 14, 2026-10-05):
 * a competitor is not crawled, and the lists bought for a company's own
 * websites only say so rather than sitting empty or months old.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/sites/site_1", search: "" }));

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
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const OWN = { siteId: "site_1", host: "a.com", relationship: "OWNED", holds: [], rivals: [], checkDays: [], counts: {} };
const RIVAL = { ...OWN, siteId: "site_rival", host: "rival.com", relationship: "TRACKED", ofSiteId: "site_1", ofHost: "a.com" };

/** The newest crawl, as the Site audit reads it. */
const AUDIT = {
  day: "2026-10-05", pagesCrawled: 412, maxPages: 1_000, pagesFound: 412, onPageScore: 88, linksInternal: 3_000, linksExternal: 120,
  cms: null, server: null, turnedAway: null, issues: [{ check: "no_title", pages: 3, severity: "ERROR" }],
};

function answer(answers: Record<string, unknown>) {
  vi.mocked(useQuery).mockImplementation(answerQueries(answers));
}

// A block, not an arrow returning the mock: a returned function is run as the hook's clean-up.
beforeEach(() => {
  vi.mocked(useQuery).mockReset();
});

describe("the Site audit", () => {
  it("says a competitor is not crawled, and leads to the website it is measured against", () => {
    answer({ "sites:getMySite": RIVAL, "siteCrawl:siteAudit": AUDIT });
    render(<SiteAuditPage />);
    expect(screen.getByText("sites.audit.competitor")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "sites.common.openOwnSite a.com" })).toHaveAttribute("href", "/app/sites/site_1/audit");
    // No figures from a crawl someone else bought, or one from before the rule.
    expect(screen.queryByText("sites.audit.score")).not.toBeInTheDocument();
  });

  it("shows a company's own website's crawl as before", () => {
    answer({ "sites:getMySite": OWN, "siteCrawl:siteAudit": AUDIT });
    render(<SiteAuditPage />);
    expect(screen.queryByText("sites.audit.competitor")).not.toBeInTheDocument();
    expect(screen.queryByText(/sites\.audit\.turnedAway/)).not.toBeInTheDocument();
    expect(screen.getByText("sites.audit.score")).toBeInTheDocument();
  });

  it("says a crawl the website turned away is not complete, rather than reading as a perfect audit", () => {
    // morehandles.co.uk, 2026-10-05: one page, and no problems found on it.
    answer({ "sites:getMySite": OWN, "siteCrawl:siteAudit": { ...AUDIT, pagesCrawled: 1, pagesFound: 1, turnedAway: "BLOCKED", issues: [] } });
    render(<SiteAuditPage />);
    expect(screen.getByText("sites.audit.turnedAway.BLOCKED 1")).toBeInTheDocument();
    expect(screen.getByText("sites.audit.notComplete")).toBeInTheDocument();
    expect(screen.queryByText("sites.audit.noIssues")).not.toBeInTheDocument();
  });
});

describe("the lists bought for a company's own websites only", () => {
  // Every link, broken links, gained and lost, the words links use and the
  // servers they come from are no longer bought for a competitor (items 6b
  // and 6c), nor who competes with it: each says so instead of sitting empty.
  const TABS = [
    ["All backlinks", SiteAllBacklinksPage, "backlinksAll", "backlinks/all"],
    ["Broken backlinks", SiteBrokenBacklinksPage, "backlinksBroken", "backlinks/broken"],
    ["New and lost links", SiteLinksNewLostPage, "backlinksNewLost", "backlinks/new-lost"],
    ["Anchors", SiteAnchorsPage, "backlinksAnchors", "backlinks/anchors"],
    ["Referring IPs", SiteReferringIpsPage, "backlinksIps", "backlinks/ips"],
    ["Organic competitors", SiteOrganicCompetitorsPage, "organic", "competitors/organic"],
  ] as const;

  it.each(TABS)("%s says so on a competitor, and leads to the website it is measured against", (_name, Page, namespace, tab) => {
    answer({ "sites:getMySite": RIVAL });
    render(<Page />);
    expect(screen.getByText(`sites.${namespace}.competitor`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "sites.common.openOwnSite a.com" })).toHaveAttribute("href", `/app/sites/site_1/${tab}`);
  });

  it.each(TABS)("%s is the list as before on a company's own website", (_name, Page, namespace) => {
    answer({ "sites:getMySite": OWN });
    render(<Page />);
    expect(screen.queryByText(`sites.${namespace}.competitor`)).not.toBeInTheDocument();
    expect(screen.getByText(`sites.${namespace}.title`)).toBeInTheDocument();
  });

  it("a competitor's keyword list says it holds the top 1,000", () => {
    answer({ "sites:getMySite": RIVAL });
    const { unmount } = render(<SiteKeywordsPage />);
    expect(screen.getByText("sites.keywords.competitorTop")).toBeInTheDocument();
    unmount();

    answer({ "sites:getMySite": OWN });
    render(<SiteKeywordsPage />);
    expect(screen.queryByText("sites.keywords.competitorTop")).not.toBeInTheDocument();
  });
});
