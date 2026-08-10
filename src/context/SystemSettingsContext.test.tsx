import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import { SystemSettingsProvider } from "./SystemSettingsContext";

vi.mock("convex/react", () => ({ useQuery: vi.fn() }));

const themeState = vi.hoisted(() => ({ theme: "dark", systemTheme: "dark" }));
vi.mock("next-themes", () => ({
  useTheme: () => themeState,
}));

const rootStyle = () => document.documentElement.style;

/**
 * The injector is the only bridge between saved settings and the CSS the app
 * renders. These tests pin its three contracts: source variables carry their
 * own names (so the @theme fallbacks in globals.css are not cycles), fonts
 * are resolved from named keys (never written self-referentially), and a
 * missing value REMOVES its variable instead of leaving a stale one.
 */
describe("SystemSettingsProvider CSS injection", () => {
  beforeEach(() => {
    themeState.theme = "dark";
    themeState.systemTheme = "dark";
  });

  afterEach(() => {
    cleanup();
    // jsdom keeps documentElement across tests; clear what the injector set.
    const style = rootStyle();
    for (const name of Array.from(style)) style.removeProperty(name);
  });

  const renderWithSettings = (settings: Record<string, unknown>) => {
    vi.mocked(useQuery).mockReturnValue({ platformName: "Sonae", brandColorHex: "#FF5A1F", ...settings });
    return render(<SystemSettingsProvider><div /></SystemSettingsProvider>);
  };

  it("writes source variables, not the @theme token names", () => {
    renderWithSettings({ brandColorHex: "#123456", darkSuccess: "#00AA00", darkDestructive: "#AA0000" });

    expect(rootStyle().getPropertyValue("--brand")).toBe("#123456");
    expect(rootStyle().getPropertyValue("--success-src")).toBe("#00AA00");
    expect(rootStyle().getPropertyValue("--destructive-src")).toBe("#AA0000");
    // Writing the token names themselves is what made the CSS fallbacks
    // self-referential cycles.
    expect(rootStyle().getPropertyValue("--color-brand")).toBe("");
    expect(rootStyle().getPropertyValue("--color-success")).toBe("");
  });

  it("derives --brand-rgb for the glow shadows, and clears it for bad hex", () => {
    renderWithSettings({ brandColorHex: "#FF5A1F" });
    expect(rootStyle().getPropertyValue("--brand-rgb")).toBe("255, 90, 31");

    renderWithSettings({ brandColorHex: "not-a-colour" });
    expect(rootStyle().getPropertyValue("--brand-rgb")).toBe("");
  });

  it("never writes a font variable that references itself", () => {
    renderWithSettings({ bodyFontFamily: "var(--font-sans)", headingFontFamily: "var(--font-sans)" });
    // The legacy self-cycle value reads as "app default": no override at all.
    expect(rootStyle().getPropertyValue("--font-sans")).toBe("");
    expect(rootStyle().getPropertyValue("--font-heading")).toBe("");

    renderWithSettings({ bodyFontFamily: "mono" });
    const stack = rootStyle().getPropertyValue("--font-sans");
    expect(stack).toContain("monospace");
    expect(stack).not.toContain("var(--font-sans)");
  });

  it("removes a themed variable when the active theme has no value for it", () => {
    renderWithSettings({ darkBg: "#101010", lightBg: undefined });
    expect(rootStyle().getPropertyValue("--bg-main")).toBe("#101010");

    // Switch to light, where no background is saved: the variable must go,
    // so the stylesheet default shows instead of last theme's colour.
    themeState.theme = "light";
    themeState.systemTheme = "light";
    renderWithSettings({ darkBg: "#101010", lightBg: undefined });
    expect(rootStyle().getPropertyValue("--bg-main")).toBe("");
  });
});
