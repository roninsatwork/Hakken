import React from "react";
import { fireEvent, render as renderBase, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/src/context/ToastContext";
import type { ReactElement, ReactNode } from "react";

const render = (ui: ReactElement) =>
  renderBase(ui, {
    wrapper: ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>,
  });
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

vi.mock("@/src/context/SystemSettingsContext", () => ({
  useSystemSettings: () => ({ platformName: "Hakken" }),
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
    featuresOff,
    offForEveryone = [],
  }: { role?: string; enabledModules?: string[]; featuresOff?: string[]; offForEveryone?: string[] } = {}) {
    (useQuery as unknown as HookMock).mockImplementation((queryFn: unknown) => {
      const path = getConvexPath(queryFn);
      if (path.includes("getCompanyById")) {
        return { _id: "company_1", name: "Module Corp", enabledModules };
      }
      if (path.includes("getFeatureSwitches")) return { offForEveryone, companyOff: featuresOff ?? [], companies: 6, ticked: [] };
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
    setCompanyModules.mockResolvedValue(["calls"]);
    vi.mocked(useMutation).mockImplementation((mutationFn: unknown) => {
      const path = getConvexPath(mutationFn);
      if (path.includes("setCompanyModules")) {
        return setCompanyModules as unknown as ReturnType<typeof useMutation>;
      }
      return otherMutation as unknown as ReturnType<typeof useMutation>;
    });
    mockQueries();
  });

  it("lists the menu in menu order, then the other four, as rows in the table (features-switches-plan FS5)", async () => {
    render(<CompanyFeaturesPage />);

    expect(await screen.findByRole("heading", { name: "title" })).toBeInTheDocument();

    const rows = screen.getAllByRole("row").slice(1).map((row) => row.querySelector("td span")?.textContent);
    expect(rows).toEqual([
      "dashboard", "askPlatform", "insights", "sites", "searchConsole", "bingWebmaster",
      "googleAnalytics", "clarity", "learn", "hakkenTasks", "usage",
      // Ask Hakken in ChatGPT and Claude, after the menu; at 15 rows a page, Wiki is on page 2.
      "chatApps",
      "modules.tasks.name", "modules.calls.name", "modules.reception.name",
    ]);
    // The four always on carry no tick box.
    expect(screen.getAllByText("alwaysOn")).toHaveLength(4);
    expect(screen.queryByRole("checkbox", { name: "dashboard" })).not.toBeInTheDocument();
    // Twice on purpose: once visibly in the name column, and once as the
    // tick box's own label, which is hidden but still tied to the box.
    const named = screen.getAllByText("modules.calls.name");
    expect(named).toHaveLength(2);
    expect(named.some((node) => node.classList.contains("sr-only"))).toBe(true);
  });

  it("ticks every menu feature the company hasn't switched off", async () => {
    mockQueries({ featuresOff: ["bingWebmaster"] });
    render(<CompanyFeaturesPage />);

    expect(await screen.findByRole("checkbox", { name: "searchConsole" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "bingWebmaster" })).not.toBeChecked();
  });

  it("says Off for everyone, with no tick box, for what System Settings has switched off", async () => {
    mockQueries({ offForEveryone: ["clarity"] });
    render(<CompanyFeaturesPage />);

    expect(await screen.findByText("offForEveryone")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "clarity" })).not.toBeInTheDocument();
  });

  it("links the strip's first step to System Settings → Features", async () => {
    render(<CompanyFeaturesPage />);

    expect(await screen.findByRole("link", { name: "levels.platformPage" })).toHaveAttribute("href", "/admin/settings/features");
  });

  it("carries the house search box and pagination footer", async () => {
    render(<CompanyFeaturesPage />);

    expect(await screen.findByPlaceholderText("search")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /previous/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
  });

  it("narrows the rows to what was searched for", async () => {
    render(<CompanyFeaturesPage />);

    fireEvent.change(await screen.findByPlaceholderText("search"), {
      target: { value: "calls" },
    });

    expect(screen.getByRole("checkbox", { name: "modules.calls.name" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "modules.tasks.name" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "searchConsole" })).not.toBeInTheDocument();
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

    // The toast provider always mounts its (empty) live region; the page's own
    // output is what must be absent.
    expect(container.querySelector('[role="alert"]')).toBeEmptyDOMElement();
    expect(container.children).toHaveLength(1);
  });

  it("reflects what the company already has switched on", async () => {
    mockQueries({ enabledModules: ["calls"] });
    render(<CompanyFeaturesPage />);

    expect(await screen.findByRole("checkbox", { name: /calls/ })).toBeChecked();
  });

  it("saves both kinds through its own mutation, not the profile save", async () => {
    render(<CompanyFeaturesPage />);

    const save = await screen.findByRole("button", { name: "save" });
    expect(save).toBeDisabled();

    fireEvent.click(await screen.findByRole("checkbox", { name: /calls/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "searchConsole" }));
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => {
      expect(setCompanyModules).toHaveBeenCalledWith({
        id: "company_1",
        enabledModules: ["calls"],
        featuresOff: ["searchConsole"],
      });
    });
    // The profile mutations must not fire: ticking a module should not rewrite
    // the company's name, tagline or plan.
    expect(otherMutation).not.toHaveBeenCalled();
  });

  it("can switch a module back off, and a menu feature back on", async () => {
    mockQueries({ enabledModules: ["calls"], featuresOff: ["clarity"] });
    render(<CompanyFeaturesPage />);

    fireEvent.click(await screen.findByRole("checkbox", { name: /calls/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "clarity" }));
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      expect(setCompanyModules).toHaveBeenCalledWith({
        id: "company_1",
        enabledModules: [],
        featuresOff: [],
      });
    });
  });

  it("surfaces a failed save rather than looking successful", async () => {
    setCompanyModules.mockRejectedValue(new Error("Unauthorized"));
    render(<CompanyFeaturesPage />);

    fireEvent.click(await screen.findByRole("checkbox", { name: /calls/ }));
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      expect(screen.getByText(/Unauthorized|saveFailed/)).toBeInTheDocument();
    });
  });
});
