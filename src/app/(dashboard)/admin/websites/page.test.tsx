import React from "react";
import type { ReactElement, ReactNode } from "react";
import { fireEvent, render as renderBase, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";

import { formatDateTime } from "@/src/lib/dates";
import { ToastProvider } from "@/src/context/ToastContext";
import AllWebsitesPage from "./page";

/**
 * The global list — the screen that shows the model working.
 *
 * A host three clients watch is one row, not three, and the Fetched column
 * names the client whose cadence is driving the pull. That column is the first
 * place anyone will look when the DataForSEO bill is higher than expected, so
 * it is asserted rather than assumed.
 */

const push = vi.fn();

const render = (ui: ReactElement) =>
  renderBase(ui, {
    wrapper: ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>,
  });

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useParams: () => ({}),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const translate = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${Object.values(values).join(",")}` : key;
    translate.rich = (key: string) => key;
    return translate;
  },
}));

vi.mock("@/src/hooks/useDebounce", () => ({ default: (value: unknown) => value }));

function convexPath(reference: unknown) {
  try {
    return getFunctionName(reference as never);
  } catch {
    const maybe = reference as { _path?: unknown };
    return typeof maybe._path === "string" ? maybe._path : "";
  }
}

const sharedHost = {
  _id: "website_1",
  _creationTime: 1,
  host: "rival.com",
  displayHost: "rival.com",
  firstSeenAt: 1_700_000_000_000,
  watcherCount: 3,
  companyCount: 2,
  ownedCount: 0,
  trackedCount: 3,
  // The schedules rework replaced a cadence word with the moment of the next
  // pull: a schedule can say "Mondays at 02:00", which has no single speed to
  // name, so the honest thing to show is when it next runs.
  nextPullAt: 1_700_000_000_000,
  fetchedFor: { companyName: "Ronins Agency", context: "ourshop.com" },
};

const unwatchedHost = {
  ...sharedHost,
  _id: "website_2",
  host: "quiet.com",
  displayHost: "quiet.com",
  watcherCount: 0,
  companyCount: 0,
  trackedCount: 0,
  nextPullAt: null,
  fetchedFor: null,
};

describe("AllWebsitesPage", () => {
  const createWebsite = vi.fn();
  const deleteWebsite = vi.fn();

  function mockRows(results: unknown[]) {
    vi.mocked(usePaginatedQuery).mockReturnValue({
      results,
      status: "Exhausted",
      loadMore: vi.fn(),
      isLoading: false,
    } as unknown as ReturnType<typeof usePaginatedQuery>);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    createWebsite.mockResolvedValue({ websiteId: "website_3", created: true });

    deleteWebsite.mockResolvedValue(null);
    vi.mocked(useMutation).mockImplementation((reference: unknown) =>
      convexPath(reference).includes("createWebsite") ? (createWebsite as never)
        : convexPath(reference).includes("deleteWebsite") ? (deleteWebsite as never)
          : (vi.fn() as never),
    );
    vi.mocked(useQuery).mockImplementation(((reference: unknown) =>
      convexPath(reference).includes("previewWebsiteHost")
        ? { ok: true, host: "new.com", displayHost: "new.com", alreadyKnown: false }
        : undefined
    ) as never);

    mockRows([sharedHost, unwatchedHost]);
  });

  it("shows one row for a host several clients watch", async () => {
    render(<AllWebsitesPage />);

    expect(await screen.findByRole("heading", { name: "title" })).toBeInTheDocument();
    expect(screen.getAllByText("rival.com")).toHaveLength(1);
    expect(screen.getByText("watchers:2")).toBeInTheDocument();
    // Three holdings across those two companies: who owns it, who tracks it.
    expect(screen.getByText("holdings:0,3,")).toBeInTheDocument();
  });

  it("names the client whose cadence is driving the pull", async () => {
    // The answer to "why is this host being fetched every day".
    render(<AllWebsitesPage />);

    expect(
      await screen.findByText(formatDateTime(1_700_000_000_000)),
    ).toBeInTheDocument();
    expect(screen.getByText("fetchedFor:Ronins Agency,ourshop.com")).toBeInTheDocument();
  });

  it("says when a host is fetched at no rate at all", async () => {
    render(<AllWebsitesPage />);

    // Not "monthly" — nothing. Nobody watching it is collecting.
    expect(await screen.findByText("notFetched")).toBeInTheDocument();
  });

  it("opens a website when its row is clicked", async () => {
    render(<AllWebsitesPage />);

    fireEvent.click(await screen.findByText("rival.com"));
    expect(push).toHaveBeenCalledWith("/admin/websites/website_1");
  });

  it("deletes a website from its row, after the same confirmation as its record", async () => {
    render(<AllWebsitesPage />);

    const bins = await screen.findAllByRole("button", { name: "deleteWebsite" });
    fireEvent.click(bins[1]);
    // The confirmation names the site, and nothing is deleted until it is confirmed.
    expect(await screen.findByText("deleteTitle", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(deleteWebsite).not.toHaveBeenCalled();
    // Pressing the bin does not also open the record behind it.
    expect(push).not.toHaveBeenCalled();

    const confirm = screen.getAllByRole("button", { name: "deleteWebsite" }).at(-1)!;
    fireEvent.click(confirm);
    await waitFor(() => expect(deleteWebsite).toHaveBeenCalledWith({ id: "website_2" }));
  });

  it("adds a host and goes straight to it", async () => {
    render(<AllWebsitesPage />);

    fireEvent.click(await screen.findByRole("button", { name: /addWebsite/ }));
    fireEvent.change(await screen.findByLabelText("urlLabel", {}, { timeout: 5000 }), {
      target: { value: "https://new.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "add" }));

    await waitFor(() => {
      expect(createWebsite).toHaveBeenCalledWith({ url: "https://new.com" });
    });
    // Adding here is half the job; the next thing is attaching it to a company.
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/admin/websites/website_3");
    });
  });

  it("surfaces a refused address rather than closing the form", async () => {
    createWebsite.mockRejectedValue(new Error("Enter a domain name rather than an IP address."));
    render(<AllWebsitesPage />);

    fireEvent.click(await screen.findByRole("button", { name: /addWebsite/ }));
    fireEvent.change(await screen.findByLabelText("urlLabel", {}, { timeout: 5000 }), {
      target: { value: "8.8.8.8" },
    });
    fireEvent.click(screen.getByRole("button", { name: "add" }));

    await waitFor(() => {
      expect(screen.getByText(/IP address|errors\.saveFailed/)).toBeInTheDocument();
    });
    expect(screen.getByLabelText("urlLabel")).toBeInTheDocument();
  });

  it("tells an empty system apart from an empty search", async () => {
    mockRows([]);
    render(<AllWebsitesPage />);

    expect((await screen.findAllByText("empty")).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText("searchPlaceholder"), {
      target: { value: "nothing" },
    });

    await waitFor(() => {
      expect(screen.queryAllByText("empty")).toHaveLength(0);
    });
    expect(screen.getAllByText("emptySearch").length).toBeGreaterThan(0);
  });
});
