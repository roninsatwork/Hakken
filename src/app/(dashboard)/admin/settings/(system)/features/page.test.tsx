import React from "react";
import { fireEvent, render as renderBase, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/src/context/ToastContext";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import PlatformFeaturesPage from "./page";

/**
 * System Settings → Features (docs/plans/active/features-switches-plan-2026-11-21.md, FS4):
 * the menu in its order, how many companies have each ticked, and one save of
 * what is off for everyone.
 */

const render = (ui: ReactElement) =>
  renderBase(ui, {
    wrapper: ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>,
  });

type HookMock = { mockImplementation: (implementation: (...args: unknown[]) => unknown) => void };

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    key === "companiesOn" ? `${values?.on} of ${values?.all}` : key,
}));

vi.mock("@/src/context/SystemSettingsContext", () => ({
  useSystemSettings: () => ({ platformName: "Hakken" }),
}));

function pathOf(reference: unknown) {
  try {
    return getFunctionName(reference as never);
  } catch {
    return "";
  }
}

describe("PlatformFeaturesPage", () => {
  const save = vi.fn();

  function mockQueries({ role = "SUPER_ADMIN", offForEveryone = [] as string[] } = {}) {
    (useQuery as unknown as HookMock).mockImplementation((reference: unknown) => {
      const path = pathOf(reference);
      if (path.includes("getMe")) return { role };
      if (path.includes("getFeatureSwitches")) {
        return { offForEveryone, companies: 6, ticked: [{ feature: "bingWebmaster", companies: 4 }, { feature: "clarity", companies: 6 }] };
      }
      return undefined;
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue([]);
    vi.mocked(useMutation).mockReturnValue(save as unknown as ReturnType<typeof useMutation>);
    mockQueries();
  });

  it("lists the menu in its order, the four always on without a tick box", async () => {
    render(<PlatformFeaturesPage />);

    expect(await screen.findByRole("heading", { name: "title" })).toBeInTheDocument();
    const rows = screen.getAllByRole("row").slice(1).map((row) => row.querySelector("td span")?.textContent);
    expect(rows).toEqual([
      "dashboard", "askPlatform", "insights", "sites", "searchConsole", "bingWebmaster",
      "googleAnalytics", "clarity", "learn", "hakkenTasks", "usage",
      // Ask Hakken in ChatGPT and Claude, after the menu (Anthony, 2026-11-21: "this should be in the table").
      "chatApps",
    ]);
    expect(screen.getAllByText("alwaysOn")).toHaveLength(4);
    expect(screen.getAllByRole("checkbox")).toHaveLength(8);
  });

  it("counts the companies that have each one switched on, and says Off for everyone for what is", async () => {
    mockQueries({ offForEveryone: ["clarity"] });
    render(<PlatformFeaturesPage />);

    const bing = (await screen.findByRole("checkbox", { name: "bingWebmaster" })).closest("tr");
    expect(bing?.textContent).toContain("4 of 6");
    const clarity = screen.getByRole("checkbox", { name: "clarity" });
    expect(clarity).not.toBeChecked();
    expect(clarity.closest("tr")?.textContent).toContain("offForEveryone");

    // Ticked again before saving, it shows what each company gets back.
    fireEvent.click(clarity);
    expect(clarity.closest("tr")?.textContent).toContain("6 of 6");
  });

  it("saves what is off for everyone", async () => {
    render(<PlatformFeaturesPage />);

    const button = await screen.findByRole("button", { name: "save" });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "searchConsole" }));
    expect(button).toBeEnabled();
    fireEvent.click(button);

    await waitFor(() => expect(save).toHaveBeenCalledWith({ featuresOff: ["searchConsole"] }));
  });

  it("is a platform administrator's page", () => {
    mockQueries({ role: "READ_ONLY" });
    render(<PlatformFeaturesPage />);

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByText("onlyPlatform")).toBeInTheDocument();
  });
});
