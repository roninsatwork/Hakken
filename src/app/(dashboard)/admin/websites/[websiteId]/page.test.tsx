import React from "react";
import type { ReactElement, ReactNode } from "react";
import { fireEvent, render as renderBase, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";

import { ToastProvider } from "@/src/context/ToastContext";
import WebsiteDetailPage from "./page";

/**
 * One website, and the delete that reaches across companies.
 *
 * The assertion that matters is that the confirmation names every company and
 * division about to lose the website *before* the button is pressed. A shared
 * record makes this delete unusually far-reaching — one press can strip a
 * competitor out of three clients' divisions — and from a screen showing a
 * single host there is no way to know that unless it is said.
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

describe("WebsiteDetailPage", () => {
  const deleteWebsite = vi.fn();

  function mockWebsite(row: unknown = website) {
    vi.mocked(useQuery).mockImplementation(((reference: unknown) =>
      convexPath(reference).includes("getWebsiteById") ? row : undefined
    ) as never);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    deleteWebsite.mockResolvedValue(true);
    vi.mocked(useMutation).mockImplementation((reference: unknown) =>
      convexPath(reference).includes("deleteWebsite") ? (deleteWebsite as never) : (vi.fn() as never),
    );
    mockWebsite();
  });

  it("lists every company holding or tracking the host, and says which", async () => {
    render(<WebsiteDetailPage />);

    expect(await screen.findByRole("heading", { name: "rival.com" })).toBeInTheDocument();
    expect(screen.getByText("Ronins Agency")).toBeInTheDocument();
    expect(screen.getByText("Acme Ltd")).toBeInTheDocument();
    // Ronins tracks it against one of their sites; Acme holds it as their own.
    expect(screen.getByText("ourshop.com")).toBeInTheDocument();
    expect(screen.getByText("theirOwnSite")).toBeInTheDocument();
  });

  it("shows what each watcher asks for, and when one is not collecting", async () => {
    render(<WebsiteDetailPage />);

    // Ronins is collecting, so its row reads its schedule back in words.
    expect(
      await screen.findByText(/scheduleSummary\.daily/),
    ).toBeInTheDocument();
    // Acme is switched off, so it asks for nothing rather than monthly. A
    // paused watcher keeps its interval; the screen must not read it out.
    expect(screen.getByText("paused")).toBeInTheDocument();
    expect(screen.queryByText(/scheduleSummary\.monthly/)).not.toBeInTheDocument();
  });

  it("names everyone who loses the website before the delete happens", async () => {
    render(<WebsiteDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: /deleteWebsite/ }));

    const dialog = await screen.findByRole("dialog", {}, { timeout: 5000 });
    expect(await screen.findByText("deleteConfirm:rival.com")).toBeInTheDocument();
    expect(screen.getByText("affectedTitle:2")).toBeInTheDocument();
    expect(screen.getByText("deleteWarningBody")).toBeInTheDocument();

    // Scoped to the dialog: both names are also in the table behind it, and the
    // whole point is that they are repeated *inside the confirmation*.
    expect(within(dialog).getByText("Ronins Agency")).toBeInTheDocument();
    expect(within(dialog).getByText("Acme Ltd")).toBeInTheDocument();
    expect(deleteWebsite).not.toHaveBeenCalled();
  });

  it("deletes on confirmation and returns to the list", async () => {
    render(<WebsiteDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: /deleteWebsite/ }));
    const confirm = await screen.findAllByRole("button", { name: /deleteWebsite/ }, { timeout: 5000 });
    fireEvent.click(confirm[confirm.length - 1]);

    await waitFor(() => {
      expect(deleteWebsite).toHaveBeenCalledWith({ id: "website_1" });
    });
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/admin/websites");
    });
  });

  it("stays put and says why when the delete is refused", async () => {
    deleteWebsite.mockRejectedValue(new Error("Unauthorized"));
    render(<WebsiteDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: /deleteWebsite/ }));
    const confirm = await screen.findAllByRole("button", { name: /deleteWebsite/ }, { timeout: 5000 });
    fireEvent.click(confirm[confirm.length - 1]);

    await waitFor(() => {
      expect(screen.getByText(/Unauthorized|errors\.deleteFailed/)).toBeInTheDocument();
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("says so when nobody is watching", async () => {
    mockWebsite({ ...website, nextPullAt: null, watchers: [] });
    render(<WebsiteDetailPage />);

    expect((await screen.findAllByText("notFetched")).length).toBeGreaterThan(0);
    expect(screen.getByText("noWatchers")).toBeInTheDocument();
  });

  it("says so plainly when the website does not exist", () => {
    mockWebsite(null);
    render(<WebsiteDetailPage />);

    expect(screen.getByText("notFound")).toBeInTheDocument();
  });
});
