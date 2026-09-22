import React from "react";
import type { ReactElement, ReactNode } from "react";
import { render as renderBase, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";

import { ToastProvider } from "@/src/context/ToastContext";
import WebsiteWatchersPage from "./page";

/**
 * Who is watching one host.
 *
 * The one page in the product that crosses companies, and the only private
 * thing in the website record: everything else on it — names, searches,
 * questions, rivals — is shared with every client attached, deliberately. A
 * competitor list is a strategy and a client book, so it is not.
 *
 * Split out of the old single-page website detail on 2026-09-22, when the
 * host gained lists of its own and that page became five jobs on one scroll.
 */

const push = vi.fn();

const render = (ui: ReactElement) =>
  renderBase(ui, {
    wrapper: ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>,
  });

vi.mock("next/navigation", () => ({
  useParams: () => ({ websiteId: "website_1" }),
  useRouter: () => ({ push }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const translate = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${Object.values(values).join(",")}` : key;
    translate.rich = (key: string, values?: Record<string, unknown>) =>
      `${key}:${String(values?.host ?? "")}`;
    return translate;
  },
}));

function convexPath(reference: unknown) {
  try {
    return getFunctionName(reference as never);
  } catch {
    const maybe = reference as { _path?: unknown };
    return typeof maybe._path === "string" ? maybe._path : "";
  }
}

const DAILY_INTERVAL = JSON.stringify({
  version: 2,
  kind: "recurring",
  cadence: "daily",
  timeLocal: "09:00",
  timezone: "UTC",
});

const MONTHLY_INTERVAL = JSON.stringify({
  version: 2,
  kind: "recurring",
  cadence: "monthly",
  dayOfMonth: 1,
  timeLocal: "09:00",
  timezone: "UTC",
});

const website = {
  _id: "website_1",
  _creationTime: 1,
  host: "rival.com",
  displayHost: "rival.com",
  firstSeenAt: 1_700_000_000_000,
  // Since the schedules rework a watcher carries the platform's own interval
  // string, not a cadence word, and the host carries the moment of its next
  // pull. A schedule that says "Mondays at 02:00" has no single speed to name.
  nextPullAt: 1_700_000_000_000,
  watchers: [
    {
      key: "competitor_1",
      companyId: "company_1",
      companyName: "Ronins Agency",
      relationship: "TRACKED",
      againstHost: "ourshop.com",
      companyWebsiteId: "companyWebsite_1",
      intervalStr: DAILY_INTERVAL,
      collecting: true,
      nextRunAt: 1_700_000_000_000,
    },
    {
      key: "companyWebsite_2",
      companyId: "company_2",
      companyName: "Acme Ltd",
      relationship: "OWNED",
      againstHost: null,
      companyWebsiteId: "companyWebsite_2",
      intervalStr: MONTHLY_INTERVAL,
      collecting: false,
      nextRunAt: null,
    },
  ],
};

describe("WebsiteWatchersPage", () => {
  function mockWebsite(row: unknown = website) {
    vi.mocked(useQuery).mockImplementation(((reference: unknown) =>
      convexPath(reference).includes("getWebsiteById") ? row : undefined
    ) as never);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMutation).mockImplementation(() => vi.fn() as never);
    mockWebsite();
  });

  it("lists every company holding or tracking the host, and says which", async () => {
    render(<WebsiteWatchersPage />);

    expect(await screen.findByText("Ronins Agency")).toBeInTheDocument();
    expect(screen.getByText("Acme Ltd")).toBeInTheDocument();
    // Ronins tracks it against one of their sites; Acme holds it as their own.
    expect(screen.getByText("ourshop.com")).toBeInTheDocument();
    expect(screen.getByText("theirOwnSite")).toBeInTheDocument();
  });

  it("shows what each watcher asks for, and when one is not collecting", async () => {
    render(<WebsiteWatchersPage />);

    // Ronins is collecting, so its row reads its schedule back in words.
    expect(await screen.findByText(/scheduleSummary\.daily/)).toBeInTheDocument();
    // Acme is switched off, so it asks for nothing rather than monthly. A
    // paused watcher keeps its interval; the screen must not read it out.
    expect(screen.getByText("paused")).toBeInTheDocument();
    expect(screen.queryByText(/scheduleSummary\.monthly/)).not.toBeInTheDocument();
  });

  it("says so when nobody is watching", async () => {
    mockWebsite({ ...website, nextPullAt: null, watchers: [] });
    render(<WebsiteWatchersPage />);

    // Twice, and deliberately: the table's own empty state says it, and so does
    // the footer, which is what a footer is for. Asserting one would fail the
    // moment either half did its job.
    expect((await screen.findAllByText("noWatchers")).length).toBeGreaterThan(0);
  });

  it("says so plainly when the website does not exist", () => {
    mockWebsite(null);
    render(<WebsiteWatchersPage />);

    expect(screen.getByText("notFound")).toBeInTheDocument();
  });
});
