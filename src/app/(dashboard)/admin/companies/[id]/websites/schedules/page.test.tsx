import React from "react";
import type { ReactElement, ReactNode } from "react";
import { fireEvent, render as renderBase, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";

import { ToastProvider } from "@/src/context/ToastContext";
import CompanyDataCollectionPage from "./page";

/**
 * A company's data-collection schedule.
 *
 * The thing worth holding is that this is a *setting the Planner reads*, in
 * the platform's own schedule format: it names no agent and wakes nothing
 * itself. The DataForSEO Planner and Collector each run on their own agent
 * schedule. The first version of this screen wrote its own settings that
 * nothing read; the second named the Collector, so every company's row woke
 * it and nothing woke the Planner.
 */

const render = (ui: ReactElement) =>
  renderBase(ui, {
    wrapper: ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>,
  });

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "company_1" }) }));

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const translate = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${Object.values(values).join(",")}` : key;
    translate.rich = (key: string) => key;
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

const collectorAgent = { _id: "agent_1", name: "DataForSEO Agent Collector", systemKey: "DATAFORSEO_COLLECTOR" };

describe("CompanyDataCollectionPage", () => {
  const saveCompanySchedule = vi.fn();
  const collectNow = vi.fn();

  function mockQueries({
    schedule = null as unknown,
    agents = [collectorAgent] as unknown[],
  } = {}) {
    vi.mocked(useQuery).mockImplementation(((reference: unknown) => {
      const path = convexPath(reference);
      if (path.includes("getCompanyById")) return { _id: "company_1", name: "Ronins Agency" };
      if (path.includes("getCompanySchedule")) return schedule;
      if (path.includes("agents")) return agents;
      return undefined;
    }) as never);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    saveCompanySchedule.mockResolvedValue("schedule_1");

    vi.mocked(useMutation).mockImplementation((reference: unknown) => {
      const path = convexPath(reference);
      if (path.includes("saveCompanySchedule")) return saveCompanySchedule as never;
      if (path.includes("collectNow")) return collectNow as never;
      return vi.fn() as never;
    });

    mockQueries();
  });

  it("a company with no schedule collects nothing", async () => {
    render(<CompanyDataCollectionPage />);

    expect(await screen.findByRole("switch", { name: "collectionLabel" }))
      .toHaveAttribute("aria-checked", "false");
  });

  it("reflects a schedule the company already has", async () => {
    mockQueries({
      schedule: { _id: "schedule_1", intervalStr: "daily", isActive: true, companyId: "company_1" },
    });
    render(<CompanyDataCollectionPage />);

    expect(await screen.findByRole("switch", { name: "collectionLabel" }))
      .toHaveAttribute("aria-checked", "true");
  });

  it("saves the company's setting and names no agent", async () => {
    // A row naming the Collector was woken by the dispatcher for each company,
    // which sent a queue nothing had filled. The Planner reads this instead.
    render(<CompanyDataCollectionPage />);

    fireEvent.click(await screen.findByRole("switch", { name: "collectionLabel" }));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(saveCompanySchedule).toHaveBeenCalledWith({
        companyId: "company_1",
        name: "scheduleName:Ronins Agency",
        intervalStr: expect.any(String),
        isActive: true,
      });
    });
  });

  it("saves a schedule the company already has the same way, switch and all", async () => {
    mockQueries({
      schedule: { _id: "schedule_1", name: "SEO", intervalStr: "daily", isActive: true, companyId: "company_1" },
    });
    render(<CompanyDataCollectionPage />);

    fireEvent.click(await screen.findByRole("switch", { name: "collectionLabel" }));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(saveCompanySchedule).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: "company_1", isActive: false }),
      );
    });
  });

  it("saves with no DataForSEO agent at all, because the setting starts nothing itself", async () => {
    mockQueries({ agents: [] });
    render(<CompanyDataCollectionPage />);

    fireEvent.click(await screen.findByRole("switch", { name: "collectionLabel" }));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(saveCompanySchedule).toHaveBeenCalledWith(expect.objectContaining({ isActive: true }));
    });
  });

  it("surfaces a failed save rather than looking successful", async () => {
    saveCompanySchedule.mockRejectedValue(new Error("Unauthorized"));
    render(<CompanyDataCollectionPage />);

    fireEvent.click(await screen.findByRole("switch", { name: "collectionLabel" }));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText(/Unauthorized|errors\.saveFailed/)).toBeInTheDocument();
    });
    expect(screen.queryByText("saved")).not.toBeInTheDocument();
  });

  describe("Collect now", () => {
    // A one-off outside the schedule (Anthony, 2026-09-25): the Planner queues
    // the company's collection, then the Collector sends it.
    const plannerAgent = { _id: "agent_2", name: "Queue Planner", systemKey: "DATAFORSEO_PLANNER", isActive: true };
    const collecting = { _id: "schedule_1", name: "SEO data — Ronins Agency", companyId: "company_1", intervalStr: "weekly", isActive: true };

    it("waits for collection to be switched on and saved, and says so beside the button", async () => {
      mockQueries({ schedule: { ...collecting, isActive: false }, agents: [collectorAgent, plannerAgent] });
      render(<CompanyDataCollectionPage />);

      expect(await screen.findByRole("button", { name: "button" })).toBeDisabled();
      expect(screen.getByText("off")).toBeInTheDocument();
    });

    it("names an agent that is switched off rather than failing on press", async () => {
      mockQueries({ schedule: collecting, agents: [collectorAgent, { ...plannerAgent, isActive: false }] });
      render(<CompanyDataCollectionPage />);

      expect(await screen.findByRole("button", { name: "button" })).toBeDisabled();
      expect(screen.getByText("agentOff:Queue Planner")).toBeInTheDocument();
    });

    it("starts the company's collection once, says what happened, and opens its run", async () => {
      collectNow.mockResolvedValue({ outcome: "QUEUED", cycleId: "cycle_1" });
      mockQueries({ schedule: collecting, agents: [collectorAgent, plannerAgent] });
      render(<CompanyDataCollectionPage />);

      fireEvent.click(await screen.findByRole("button", { name: "button" }));

      expect(await screen.findByText(/outcomes\.QUEUED:Ronins Agency/)).toBeInTheDocument();
      expect(collectNow).toHaveBeenCalledWith({ companyId: "company_1" });
      expect(screen.getByRole("link", { name: /follow/ })).toHaveAttribute("href", "/admin/companies/company_1/websites/runs/cycle_1");
      // The schedule itself is left exactly as it is.
      expect(saveCompanySchedule).not.toHaveBeenCalled();
    });

    it("shows why it could not start", async () => {
      collectNow.mockRejectedValue(new Error("Collection is switched off for Ronins Agency. Switch it on and save first."));
      mockQueries({ schedule: collecting, agents: [collectorAgent, plannerAgent] });
      render(<CompanyDataCollectionPage />);

      fireEvent.click(await screen.findByRole("button", { name: "button" }));

      expect(await screen.findByText(/Collection is switched off for Ronins Agency/)).toBeInTheDocument();
    });
  });
});
