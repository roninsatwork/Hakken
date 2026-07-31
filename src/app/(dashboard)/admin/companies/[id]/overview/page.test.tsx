import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import CompanyOverviewPage from "./page";

/**
 * The optional-modules card on the company overview screen.
 *
 * Worth its own test because this control is the only thing standing between a
 * workspace and a section built for someone else, and because it saves through
 * its own mutation rather than the profile save beside it — a wiring mistake
 * would look identical on screen and do nothing.
 */

type HookMock = {
  mockImplementation: (implementation: (...args: unknown[]) => unknown) => void;
};

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "company_1" }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

function getConvexPath(functionReference: unknown) {
  try {
    return getFunctionName(functionReference as never);
  } catch {
    const maybeReference = functionReference as { _path?: unknown; name?: unknown };
    return typeof maybeReference._path === "string"
      ? maybeReference._path
      : typeof maybeReference.name === "string"
        ? maybeReference.name
        : "";
  }
}

describe("CompanyOverviewPage — optional modules", () => {
  const setCompanyModules = vi.fn();
  const otherMutation = vi.fn();

  function mockQueries({
    role = "SUPER_ADMIN",
    enabledModules,
  }: { role?: string; enabledModules?: string[] } = {}) {
    (useQuery as unknown as HookMock).mockImplementation((queryFn: unknown) => {
      const path = getConvexPath(queryFn);
      if (path.includes("getCompanyById")) {
        return { _id: "company_1", name: "Module Corp", enabledModules };
      }
      if (path.includes("getMe")) return { role };
      if (path.includes("getActivePlans")) return [];
      if (path.includes("getCompanyPlanStatus")) {
        return { planName: "None", messagesUsed: 0, messageLimit: -1 };
      }
      return undefined;
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    setCompanyModules.mockResolvedValue(["salesData"]);
    vi.mocked(useMutation).mockImplementation((mutationFn: unknown) => {
      const path = getConvexPath(mutationFn);
      if (path.includes("setCompanyModules")) {
        return setCompanyModules as unknown as ReturnType<typeof useMutation>;
      }
      return otherMutation as unknown as ReturnType<typeof useMutation>;
    });
    mockQueries();
  });

  it("shows the registered modules to a super admin", () => {
    render(<CompanyOverviewPage />);

    expect(screen.getByText("Optional Modules")).toBeInTheDocument();
    expect(screen.getByText("modules.salesData.name")).toBeInTheDocument();
  });

  it("hides the card from anyone who is not a super admin", () => {
    // A workspace admin choosing their own workspace's modules would defeat
    // the point of the flag.
    mockQueries({ role: "ADMIN" });
    render(<CompanyOverviewPage />);

    expect(screen.queryByText("Optional Modules")).not.toBeInTheDocument();
  });

  it("reflects what the company already has switched on", () => {
    mockQueries({ enabledModules: ["salesData"] });
    render(<CompanyOverviewPage />);

    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("saves through its own mutation, not the profile save", async () => {
    render(<CompanyOverviewPage />);

    const save = screen.getByRole("button", { name: /Save Modules/i });
    expect(save).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => {
      expect(setCompanyModules).toHaveBeenCalledWith({
        id: "company_1",
        enabledModules: ["salesData"],
      });
    });
    // The profile mutations must not fire: ticking a module should not rewrite
    // the company's name, tagline or plan.
    expect(otherMutation).not.toHaveBeenCalled();
  });

  it("can switch a module back off", async () => {
    mockQueries({ enabledModules: ["salesData"] });
    render(<CompanyOverviewPage />);

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Save Modules/i }));

    await waitFor(() => {
      expect(setCompanyModules).toHaveBeenCalledWith({
        id: "company_1",
        enabledModules: [],
      });
    });
  });

  it("surfaces a failed save rather than looking successful", async () => {
    setCompanyModules.mockRejectedValue(new Error("Unauthorized"));
    render(<CompanyOverviewPage />);

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Save Modules/i }));

    await waitFor(() => {
      expect(screen.getByText(/Unauthorized|Failed to update modules/)).toBeInTheDocument();
    });
  });
});
