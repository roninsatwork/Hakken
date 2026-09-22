import React from "react";
import type { ReactElement, ReactNode } from "react";
import { fireEvent, render as renderBase, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";

import { ToastProvider } from "@/src/context/ToastContext";
import WebsiteRecordLayout from "./layout";

/**
 * The website record's frame: its title, its tabs, and the delete.
 *
 * The assertion that matters is that the confirmation names every company about
 * to lose the website *before* the button is pressed. Delete lives on the frame
 * rather than a tab because it is an action on the whole record, and it is the
 * one thing here that reaches every company watching the host.
 */

const push = vi.fn();

const render = (ui: ReactElement) =>
  renderBase(ui, {
    wrapper: ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>,
  });

vi.mock("next/navigation", () => ({
  useParams: () => ({ websiteId: "website_1" }),
  useRouter: () => ({ push }),
  // The tab strip reads the path to decide which tab is lit, and its dropdowns
  // read the query string.
  usePathname: () => "/admin/websites/website_1",
  useSearchParams: () => new URLSearchParams(),
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

describe("WebsiteRecordLayout", () => {
  const deleteWebsite = vi.fn();

  function mockWebsite(row: unknown = website) {
    vi.mocked(useQuery).mockImplementation(((reference: unknown) =>
      convexPath(reference).includes("getWebsiteById") ? row : undefined
    ) as never);
  }

  const renderLayout = () => render(
    <WebsiteRecordLayout><div data-testid="tab-content" /></WebsiteRecordLayout>,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    deleteWebsite.mockResolvedValue(true);
    vi.mocked(useMutation).mockImplementation((reference: unknown) =>
      convexPath(reference).includes("deleteWebsite") ? (deleteWebsite as never) : (vi.fn() as never),
    );
    mockWebsite();
  });

  it("names the host once, above the tabs, and renders the open tab beneath", async () => {
    renderLayout();

    expect(await screen.findByRole("heading", { name: "rival.com" })).toBeInTheDocument();
    expect(screen.getByTestId("tab-content")).toBeInTheDocument();
  });

  it("names everyone who loses the website before the delete happens", async () => {
    renderLayout();

    fireEvent.click(await screen.findByRole("button", { name: /deleteWebsite/ }));

    const dialog = await screen.findByRole("dialog", {}, { timeout: 5000 });
    expect(await screen.findByText("deleteConfirm:rival.com")).toBeInTheDocument();
    expect(screen.getByText("affectedTitle:2")).toBeInTheDocument();
    expect(screen.getByText("deleteWarningBody")).toBeInTheDocument();

    // A shared record makes this delete unusually far-reaching: one press can
    // strip a competitor out of three clients at once, and from a screen
    // showing a single host there is no way to know unless it is said.
    expect(within(dialog).getByText("Ronins Agency")).toBeInTheDocument();
    expect(within(dialog).getByText("Acme Ltd")).toBeInTheDocument();
    expect(deleteWebsite).not.toHaveBeenCalled();
  });

  it("deletes on confirmation and returns to the list", async () => {
    renderLayout();

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
    renderLayout();

    fireEvent.click(await screen.findByRole("button", { name: /deleteWebsite/ }));
    const confirm = await screen.findAllByRole("button", { name: /deleteWebsite/ }, { timeout: 5000 });
    fireEvent.click(confirm[confirm.length - 1]);

    await waitFor(() => {
      expect(screen.getByText(/Unauthorized|errors\.deleteFailed/)).toBeInTheDocument();
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("says so plainly when the website does not exist", () => {
    mockWebsite(null);
    renderLayout();

    expect(screen.getByText("notFound")).toBeInTheDocument();
  });
});
