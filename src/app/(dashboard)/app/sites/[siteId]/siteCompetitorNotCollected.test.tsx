import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import SiteAuditPage from "./audit/page";

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
    expect(screen.getByText("sites.audit.score")).toBeInTheDocument();
  });
});
