import React from "react";
import type { ReactElement, ReactNode } from "react";
import { render as renderBase, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";

import { ToastProvider } from "@/src/context/ToastContext";
import CompanyWebsiteDetailPage from "./page";

/**
 * One of a company's websites: what this client decides, and where the rest is.
 *
 * What this holds is the **split**. The page used to manage competitors and
 * questions; both are facts about the host and moved to the website record on
 * 2026-09-22, so three clients watching one site stopped keeping three copies
 * of the same list. The assertions worth having are that the two settings which
 * genuinely differ per client are still here, that the shared lists are pointed
 * at the record rather than edited here, and that this client's own results are
 * pointed at the routes scoped to them.
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

function convexPath(reference: unknown) {
  try {
    return getFunctionName(reference as never);
  } catch {
    const maybe = reference as { _path?: unknown };
    return typeof maybe._path === "string" ? maybe._path : "";
  }
}

const DAILY = JSON.stringify({
  version: 2, kind: "recurring", cadence: "daily", timeLocal: "09:00", timezone: "UTC",
});

const website = {
  _id: "companyWebsite_1",
  companyId: "company_1",
  websiteId: "website_9",
  displayHost: "ourshop.com",
  companyName: "Ronins Agency",
  companyIntervalStr: DAILY,
  companyScheduleActive: true,
  locationCode: undefined,
  effective: { active: true, intervalStr: DAILY, source: "COMPANY", nextRunAt: null },
};

describe("CompanyWebsiteDetailPage", () => {
  function mockWebsite(row: unknown = website) {
    vi.mocked(useQuery).mockImplementation(((reference: unknown) =>
      convexPath(reference).includes("getCompanyWebsiteById") ? row : undefined
    ) as never);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMutation).mockImplementation(() => vi.fn() as never);
    mockWebsite();
  });

  it("keeps the two settings that genuinely differ between clients", async () => {
    render(<CompanyWebsiteDetailPage />);

    expect(await screen.findByRole("heading", { name: "ourshop.com" })).toBeInTheDocument();
    // How often this client pulls it, and where from. Everything else moved.
    expect(screen.getByText("editSettings")).toBeInTheDocument();
    // The place picker, which is per-client and stays: a London agency and a
    // Leeds one watching one host want different answers.
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("points the shared lists at the website record, not at this client", async () => {
    render(<CompanyWebsiteDetailPage />);

    // Editing any of these changes what every client watching the host sees,
    // so they are edited in one place and linked to from here.
    for (const label of ["tracked.keywords", "tracked.questions", "tracked.competition"]) {
      expect((await screen.findByText(label)).closest("a"))
        .toHaveAttribute("href", expect.stringContaining("/admin/websites/website_9/"));
    }
  });

  it("points results at the routes scoped to this client", async () => {
    render(<CompanyWebsiteDetailPage />);

    // The pull is shared; what is read out of it is this client's own, which is
    // why these stay under the company and the lists above do not.
    for (const label of ["results.keywords", "results.citations", "results.fanOut"]) {
      expect((await screen.findByText(label)).closest("a"))
        .toHaveAttribute("href", expect.stringContaining("/admin/companies/company_1/websites/site/companyWebsite_1/"));
    }
  });

  it("says so plainly when the website does not exist", () => {
    mockWebsite(null);
    render(<CompanyWebsiteDetailPage />);

    expect(screen.getByText("notFound")).toBeInTheDocument();
  });
});
