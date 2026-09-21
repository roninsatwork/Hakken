import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnalyticsProvider } from "./AnalyticsProvider";
import FluidWorkspace from "./FluidWorkspace";
import { ThemeProvider } from "../../providers/ThemeProvider";

const useQueryMock = vi.hoisted(() => vi.fn());
const useUIMock = vi.hoisted(() => vi.fn(() => ({ isSidebarOpen: true })));
const nextThemeProviderMock = vi.hoisted(() => vi.fn(({ children }: { children: React.ReactNode }) => (
  <div data-testid="next-theme-provider">{children}</div>
)));

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: { system: { getAnalyticsId: "getAnalyticsId" } },
}));

vi.mock("@next/third-parties/google", () => ({
  GoogleAnalytics: ({ gaId }: { gaId: string }) => <div data-testid="ga">{gaId}</div>,
  GoogleTagManager: ({ gtmId }: { gtmId: string }) => <div data-testid="gtm">{gtmId}</div>,
}));

vi.mock("@/src/context/UIContext", () => ({
  useUI: () => useUIMock(),
}));

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) => {
        const MotionComponent = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & { initial?: unknown; animate?: unknown; transition?: unknown }>(
          ({ children, ...props }, ref) => {
            const domProps = { ...props };
            delete domProps.initial;
            delete domProps.animate;
            delete domProps.transition;
            return React.createElement(tag, { ...domProps, ref }, children);
          }
        );
        MotionComponent.displayName = `MotionMock(${tag})`;
        return MotionComponent;
      },
    }
  ),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => (key === "projectName" ? "Hakken" : key),
}));

vi.mock("next-themes", () => ({
  ThemeProvider: (props: { children: React.ReactNode }) => nextThemeProviderMock(props),
}));

describe("shell layout components", () => {
  it("renders analytics providers only for supported analytics ids", () => {
    const { rerender } = render(<AnalyticsProvider />);

    useQueryMock.mockReturnValue(" gtm-test ");
    rerender(<AnalyticsProvider />);
    expect(screen.getByTestId("gtm")).toHaveTextContent("GTM-TEST");

    useQueryMock.mockReturnValue("g-abc123");
    rerender(<AnalyticsProvider />);
    expect(screen.getByTestId("ga")).toHaveTextContent("G-ABC123");

    useQueryMock.mockReturnValue("unsupported");
    rerender(<AnalyticsProvider />);
    expect(screen.queryByTestId("ga")).not.toBeInTheDocument();
    expect(screen.queryByTestId("gtm")).not.toBeInTheDocument();
  });

  it("renders the workspace with sidebar-aware animation props", () => {
    render(<FluidWorkspace className="extra-space">Dashboard</FluidWorkspace>);

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(document.querySelector(".extra-space")).toHaveTextContent("Dashboard");
  });

  it("wraps children in the configured next theme provider", () => {
    render(<ThemeProvider forcedTheme="dark">App shell</ThemeProvider>);

    expect(screen.getByTestId("next-theme-provider")).toHaveTextContent("App shell");
    expect(nextThemeProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({ attribute: "class", defaultTheme: "system", enableSystem: true, forcedTheme: "dark" })
    );
  });

});
