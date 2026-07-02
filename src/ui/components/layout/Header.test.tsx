import React from "react";
import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Header from "./Header";

const setIsSidebarOpen = vi.hoisted(() => vi.fn());
const useQueryMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  useMutation: (...args: unknown[]) => useMutationMock(...args),
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    users: {
      getMe: "users:getMe",
      recordLogin: "users:recordLogin",
      recordLogout: "users:recordLogout",
    },
  },
}));

vi.mock("@/src/context/UIContext", () => ({
  useUI: () => ({ isSidebarOpen: true, setIsSidebarOpen }),
}));

vi.mock("@/src/context/SystemSettingsContext", () => ({
  useSystemSettings: () => ({
    platformName: "Sonae",
  }),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signOut: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => <img alt={alt ?? ""} {...props} />,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) => {
        const MotionComponent = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & { initial?: unknown; animate?: unknown; exit?: unknown; transition?: unknown }>(
          ({ children, ...props }, ref) => {
            const domProps = { ...props };
            delete domProps.initial;
            delete domProps.animate;
            delete domProps.exit;
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

const labels: Record<string, string> = {
  admin: "Administration",
  ai: "Artificial Intelligence",
  authenticating: "Authenticating",
  dashboard: "Dashboard",
  loading: "Loading",
  properties: "Properties",
  propertiesSearch: "Search",
  runningCosts: "Running Costs",
};

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => labels[key] ?? key,
}));

describe("Header route labels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMutationMock.mockReturnValue(vi.fn());
    useQueryMock.mockReturnValue(undefined);
  });

  it("shows the active AI subsection instead of the generic platform label", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/ai/usage/costs");

    render(<Header />);

    expect(screen.getByLabelText("Artificial Intelligence / Running Costs")).toBeInTheDocument();
    expect(screen.queryByText("Platform Management")).not.toBeInTheDocument();
  });

  it("shows the Global AI skill center label", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/ai/skills");

    render(<Header />);

    expect(screen.getByLabelText("Artificial Intelligence / Skill Center")).toBeInTheDocument();
  });

  it("shows app subsection labels for non-admin routes", () => {
    vi.mocked(usePathname).mockReturnValue("/app/properties/search");

    render(<Header />);

    expect(screen.getByLabelText("Properties / Search")).toBeInTheDocument();
  });
});
