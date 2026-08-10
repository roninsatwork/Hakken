import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SystemSettingsLayout from "./layout";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/settings/identity",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

/**
 * The menu is the whole point of this layout: four subjects, each opening the
 * screens that belong to it. Before this, five flat tabs carried eight
 * unrelated sections under "System Options" and put the agent approval window
 * under log retention.
 */
/** Dropdown items only exist once their group is open, so open all four. */
function openEveryGroup() {
  for (const group of screen.getAllByRole("button", { expanded: false })) {
    fireEvent.click(group);
  }
}

describe("system settings menu", () => {
  it("groups every screen under the subject it belongs to", () => {
    render(<SystemSettingsLayout><div>content</div></SystemSettingsLayout>);

    const hrefs: (string | null)[] = [];
    for (const group of screen.getAllByRole("button")) {
      fireEvent.click(group);
      hrefs.push(...Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href")));
      fireEvent.click(group);
    }

    expect(new Set(hrefs)).toEqual(new Set([
      "/admin/settings/identity",
      "/admin/settings/identity/aesthetics",
      "/admin/settings/security",
      "/admin/settings/security/retention",
      "/admin/settings/security/purge-history",
      "/admin/settings/options",
      "/admin/settings/options/self-improvement",
      "/admin/settings/options/approvals",
    ]));
  });

  it("has no White Label group", () => {
    // Six read-only panels grading how far a rebrand had got, built to serve
    // turning this repo into packaged vertical products. Removed with that
    // premise on 2026-08-10.
    render(<SystemSettingsLayout><div>content</div></SystemSettingsLayout>);
    openEveryGroup();

    const hrefs = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs.some((href) => href?.includes("white-label"))).toBe(false);
  });

  it("keeps the sibling settings screens out of this menu", () => {
    // Plans, API Keys, Analytics and Scripts live under the same path but have
    // their own sidebar entries. This layout sits in a route group so it never
    // wraps them, and it must not link to them either.
    render(<SystemSettingsLayout><div>content</div></SystemSettingsLayout>);
    openEveryGroup();

    const hrefs = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href"));

    for (const sibling of ["plans", "api-keys", "analytics", "scripts"]) {
      expect(hrefs.some((href) => href?.includes(sibling)), sibling).toBe(false);
    }
  });

  it("renders the screen it is wrapping", () => {
    render(<SystemSettingsLayout><div>content</div></SystemSettingsLayout>);
    expect(screen.getByText("content")).toBeInTheDocument();
  });
});
