import React from "react";
import type { ReactElement, ReactNode } from "react";
import { fireEvent, render as renderBase, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";

import { ToastProvider } from "@/src/context/ToastContext";
import CompanyWebsiteDetailPage from "./page";

/**
 * One of a company's websites, and the competitors tracked against it.
 *
 * The wording of the destructive path is what this holds. A competitor is a
 * shared record, so this screen may only ever stop tracking it *here* — the
 * record and its data survive for every other company watching it — and a
 * screen that said "delete" would be describing something it does not do.
 */

const render = (ui: ReactElement) =>
  renderBase(ui, {
    wrapper: ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>,
  });

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "company_1", companyWebsiteId: "companyWebsite_1" }),
  useRouter: () => ({ push: vi.fn() }),
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

vi.mock("@/src/hooks/useDebounce", () => ({ default: (value: unknown) => value }));

function convexPath(reference: unknown) {
  try {
    return getFunctionName(reference as never);
  } catch {
    const maybe = reference as { _path?: unknown };
    return typeof maybe._path === "string" ? maybe._path : "";
  }
}

const WEEKLY_INTERVAL = JSON.stringify({
  version: 2,
  kind: "recurring",
  cadence: "weekly",
  dayOfWeek: 1,
  timeLocal: "09:00",
  timezone: "UTC",
});

const companyWebsite = {
  _id: "companyWebsite_1",
  _creationTime: 1,
  companyId: "company_1",
  websiteId: "website_1",
  createdAt: 1_700_000_000_000,
  host: "ourshop.com",
  displayHost: "ourshop.com",
  companyName: "Ronins Agency",
  // Stored absence is how a website says "follow the company", so both of
  // these being undefined is the inheriting case this test is about.
  refreshIntervalStr: undefined,
  collectionEnabled: undefined,
  companyIntervalStr: WEEKLY_INTERVAL,
  companyScheduleActive: true,
  effective: {
    active: true,
    intervalStr: WEEKLY_INTERVAL,
    source: "COMPANY",
    nextRunAt: 1_700_600_000_000,
  },
};

const competitors = [
  {
    _id: "competitor_1",
    _creationTime: 1,
    companyWebsiteId: "companyWebsite_1",
    companyId: "company_1",
    websiteId: "website_2",
    createdAt: 1_700_000_000_000,
    host: "rival-a.com",
    displayHost: "rival-a.com",
  },
  {
    _id: "competitor_2",
    _creationTime: 2,
    companyWebsiteId: "companyWebsite_1",
    companyId: "company_1",
    websiteId: "website_3",
    createdAt: 1_700_000_000_000,
    host: "rival-b.com",
    displayHost: "rival-b.com",
  },
];

describe("CompanyWebsiteDetailPage", () => {
  const addCompetitor = vi.fn();
  const removeCompetitor = vi.fn();

  function mockQueries({ rows = competitors, site = companyWebsite as unknown } = {}) {
    vi.mocked(useQuery).mockImplementation(((reference: unknown) => {
      const path = convexPath(reference);
      if (path.includes("getCompanyWebsiteById")) return site;
      if (path.includes("getTrackedCompetitors")) {
        return { data: rows, totalCount: rows.length, totalPages: 1 };
      }
      if (path.includes("previewWebsiteHost")) {
        return { ok: true, host: "rival-c.com", displayHost: "rival-c.com", alreadyKnown: true };
      }
      return undefined;
    }) as never);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    addCompetitor.mockResolvedValue("competitor_3");
    removeCompetitor.mockResolvedValue(true);

    vi.mocked(useMutation).mockImplementation((reference: unknown) => {
      const path = convexPath(reference);
      if (path.includes("addTrackedCompetitor")) return addCompetitor as never;
      if (path.includes("removeTrackedCompetitor")) return removeCompetitor as never;
      return vi.fn() as never;
    });

    mockQueries();
  });

  it("lists the competitors under the website's own name", async () => {
    render(<CompanyWebsiteDetailPage />);

    expect(await screen.findByRole("heading", { name: "ourshop.com" })).toBeInTheDocument();
    expect(screen.getByText("rival-a.com")).toBeInTheDocument();
    expect(screen.getByText("rival-b.com")).toBeInTheDocument();
  });

  it("says where its cadence came from, not just what it is", async () => {
    // A setting whose value is inherited has to announce that, or the next
    // person changes the company and cannot work out why this did not move.
    render(<CompanyWebsiteDetailPage />);

    expect(await screen.findByText("sourceCompany:Ronins Agency")).toBeInTheDocument();
  });

  it("adds a competitor against this website", async () => {
    render(<CompanyWebsiteDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: /addCompetitor/ }));
    fireEvent.change(await screen.findByLabelText("urlLabel", {}, { timeout: 5000 }), {
      target: { value: "https://www.rival-c.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "add" }));

    await waitFor(() => {
      expect(addCompetitor).toHaveBeenCalledWith({
        companyWebsiteId: "companyWebsite_1",
        url: "https://www.rival-c.com",
      });
    });
  });

  it("echoes the key before saving, and says joining an existing record is fine", async () => {
    render(<CompanyWebsiteDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: /addCompetitor/ }));
    fireEvent.change(await screen.findByLabelText("urlLabel", {}, { timeout: 5000 }), {
      target: { value: "https://www.rival-c.com" },
    });

    expect(await screen.findByText("savedAs:rival-c.com")).toBeInTheDocument();
    // A rival two customers both watch is one record and one pull, so this is
    // the system working rather than a warning.
    expect(screen.getByText("alreadyKnown")).toBeInTheDocument();
  });

  it("stops tracking, and says that is what it does", async () => {
    render(<CompanyWebsiteDetailPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: "removeTitle" }))[0]);

    expect(
      await screen.findByText("removeConfirm:rival-a.com", {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByText("removeWarningBody")).toBeInTheDocument();
    expect(removeCompetitor).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "removeCompetitor" }));
    await waitFor(() => {
      expect(removeCompetitor).toHaveBeenCalledWith({ id: "competitor_1" });
    });
  });

  it("keeps the add form open and shows why when the server refuses", async () => {
    addCompetitor.mockRejectedValue(new Error("A website cannot be its own competitor."));
    render(<CompanyWebsiteDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: /addCompetitor/ }));
    fireEvent.change(await screen.findByLabelText("urlLabel", {}, { timeout: 5000 }), {
      target: { value: "ourshop.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "add" }));

    await waitFor(() => {
      expect(screen.getByText(/own competitor|errors\.saveFailed/)).toBeInTheDocument();
    });
    expect(screen.getByLabelText("urlLabel")).toBeInTheDocument();
  });

  it("tells a website with no competitors apart from an empty search", async () => {
    mockQueries({ rows: [] });
    render(<CompanyWebsiteDetailPage />);

    expect((await screen.findAllByText("empty")).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText("searchPlaceholder"), {
      target: { value: "nothing" },
    });

    await waitFor(() => {
      expect(screen.queryAllByText("empty")).toHaveLength(0);
    });
    expect(screen.getAllByText("emptySearch").length).toBeGreaterThan(0);
  });

  it("says so plainly when the website does not exist", () => {
    mockQueries({ site: null });
    render(<CompanyWebsiteDetailPage />);

    expect(screen.getByText("notFound")).toBeInTheDocument();
  });
});
