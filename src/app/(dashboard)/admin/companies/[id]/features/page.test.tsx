import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import CompanyFeaturesPage from "./page";

/**
 * The company's Features screen.
 *
 * Worth its own test because these switches are the only thing standing between
 * a workspace and a section it was not given, and because the screen saves
 * through its own mutation — a wiring mistake would look identical on screen
 * and do nothing. Lived as a card on the Overview screen until Anthony moved it
 * out on 2026-08-18; the tests moved with it.
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

describe("CompanyFeaturesPage", () => {
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

  it("shows every feature to a super admin", () => {
    render(<CompanyFeaturesPage />);

    expect(screen.getByRole("heading", { name: "Features" })).toBeInTheDocument();
    expect(screen.getByText("modules.salesData.name")).toBeInTheDocument();
  });

  it("refuses anyone who is not a super admin", () => {
    // A workspace admin choosing their own workspace's features would defeat
    // the point of the flag. The tab is hidden from them too, so this is the
    // second lock rather than the only one.
    mockQueries({ role: "ADMIN" });
    render(<CompanyFeaturesPage />);

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Only a platform administrator can change which features/)
    ).toBeInTheDocument();
  });

  it("shows nothing at all until it knows who is asking", () => {
    // A flash of "not allowed" at the person who is allowed reads as a fault.
    (useQuery as unknown as HookMock).mockImplementation(() => undefined);
    const { container } = render(<CompanyFeaturesPage />);

    expect(container).toBeEmptyDOMElement();
  });

  it("reflects what the company already has switched on", () => {
    mockQueries({ enabledModules: ["salesData"] });
    render(<CompanyFeaturesPage />);

    expect(screen.getByRole("checkbox", { name: /salesData/ })).toBeChecked();
  });

  it("saves through its own mutation, not the profile save", async () => {
    render(<CompanyFeaturesPage />);

    const save = screen.getByRole("button", { name: /Save Features/i });
    expect(save).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: /salesData/ }));
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
    render(<CompanyFeaturesPage />);

    fireEvent.click(screen.getByRole("checkbox", { name: /salesData/ }));
    fireEvent.click(screen.getByRole("button", { name: /Save Features/i }));

    await waitFor(() => {
      expect(setCompanyModules).toHaveBeenCalledWith({
        id: "company_1",
        enabledModules: [],
      });
    });
  });

  it("surfaces a failed save rather than looking successful", async () => {
    setCompanyModules.mockRejectedValue(new Error("Unauthorized"));
    render(<CompanyFeaturesPage />);

    fireEvent.click(screen.getByRole("checkbox", { name: /salesData/ }));
    fireEvent.click(screen.getByRole("button", { name: /Save Features/i }));

    await waitFor(() => {
      expect(screen.getByText(/Unauthorized|Failed to update features/)).toBeInTheDocument();
    });
  });
});
