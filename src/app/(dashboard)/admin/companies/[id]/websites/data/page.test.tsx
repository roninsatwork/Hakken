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
 * The thing worth holding is that this is the *ordinary* schedule system seen
 * from the company: it writes a `schedules` row through the same mutations the
 * Schedules screens use, so the existing dispatcher wakes it and the run shows
 * up in the agent's runs and logs. The first version of this screen wrote its
 * own settings that nothing read, which looked identical and did nothing.
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

const collectorAgent = { _id: "agent_1", name: "DataForSEO Agent" };

describe("CompanyDataCollectionPage", () => {
  const createSchedule = vi.fn();
  const updateSchedule = vi.fn();

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
    createSchedule.mockResolvedValue("schedule_1");
    updateSchedule.mockResolvedValue(true);

    vi.mocked(useMutation).mockImplementation((reference: unknown) => {
      const path = convexPath(reference);
      if (path.includes("createSchedule")) return createSchedule as never;
      if (path.includes("updateSchedule")) return updateSchedule as never;
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
      schedule: { _id: "schedule_1", intervalStr: "daily", isActive: true, agentId: "agent_1" },
    });
    render(<CompanyDataCollectionPage />);

    expect(await screen.findByRole("switch", { name: "collectionLabel" }))
      .toHaveAttribute("aria-checked", "true");
  });

  it("creates a schedule row against this company and the collecting agent", async () => {
    // The whole point of the rework: this writes a real schedule the existing
    // dispatcher will wake, not a private setting nothing reads.
    render(<CompanyDataCollectionPage />);

    fireEvent.click(await screen.findByRole("switch", { name: "collectionLabel" }));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(createSchedule).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: "agent_1", companyId: "company_1", isActive: true }),
      );
    });
    expect(updateSchedule).not.toHaveBeenCalled();
  });

  it("updates the existing row rather than creating a second one", async () => {
    mockQueries({
      schedule: { _id: "schedule_1", name: "SEO", intervalStr: "daily", isActive: true, agentId: "agent_1" },
    });
    render(<CompanyDataCollectionPage />);

    fireEvent.click(await screen.findByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(updateSchedule).toHaveBeenCalledWith(
        expect.objectContaining({ scheduleId: "schedule_1", companyId: "company_1" }),
      );
    });
    expect(createSchedule).not.toHaveBeenCalled();
  });

  it("says so when there is no agent to run the schedule", async () => {
    // A schedule pointing at nothing would look configured and never run.
    mockQueries({ agents: [] });
    render(<CompanyDataCollectionPage />);

    expect(await screen.findByText("noAgentTitle")).toBeInTheDocument();
  });

  it("refuses to save without an agent rather than writing a schedule that cannot run", async () => {
    mockQueries({ agents: [] });
    render(<CompanyDataCollectionPage />);

    fireEvent.click(await screen.findByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(screen.getAllByText("noAgentBody").length).toBeGreaterThan(0);
    });
    expect(createSchedule).not.toHaveBeenCalled();
  });

  it("surfaces a failed save rather than looking successful", async () => {
    createSchedule.mockRejectedValue(new Error("Unauthorized"));
    render(<CompanyDataCollectionPage />);

    fireEvent.click(await screen.findByRole("switch", { name: "collectionLabel" }));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText(/Unauthorized|errors\.saveFailed/)).toBeInTheDocument();
    });
    expect(screen.queryByText("saved")).not.toBeInTheDocument();
  });
});
