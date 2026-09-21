import React from "react";
import { render as renderBare, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Header from "./Header";

import { ToastProvider } from "@/src/context/ToastContext";

// The header renders the notification bell, which reports its failures
// through the house runner — so it reads the toast context the root layout
// always supplies.
const render = (ui: Parameters<typeof renderBare>[0]) => renderBare(ui, { wrapper: ToastProvider });

const setIsSidebarOpen = vi.hoisted(() => vi.fn());
const useQueryMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  useMutation: (...args: unknown[]) => useMutationMock(...args),
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  // The header now carries the notification bell, which pages its own list.
  usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: () => {}, isLoading: false }),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    users: {
      getMe: "users:getMe",
      recordLogin: "users:recordLogin",
      recordLogout: "users:recordLogout",
    },
    chat: {
      getThreadHeading: "chat:getThreadHeading",
    },
    notifications: {
      countMineUnread: "notifications:countMineUnread",
      listMine: "notifications:listMine",
      markRead: "notifications:markRead",
      markAllMineRead: "notifications:markAllMineRead",
    },
  },
}));

vi.mock("@/src/context/UIContext", () => ({
  useUI: () => ({ isSidebarOpen: true, setIsSidebarOpen }),
}));

vi.mock("@/src/context/SystemSettingsContext", () => ({
  useSystemSettings: () => ({
    platformName: "Hakken",
  }),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signOut: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ""} {...props} />
  ),
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
  arcade: "Arcade",
  authenticating: "Authenticating",
  calls: "Calls",
  dashboard: "Dashboard",
  information: "Information",
  loading: "Loading",
  logs: "Logs",
  organization: "Organization",
  postureStudio: "Posture Studio",
  properties: "Properties",
  propertiesSearch: "Search",
  reports: "Reports",
  roninsRun: "Ronin's Run",
  runningCosts: "Running Costs",
  salesReport: "Sales Report",
  skillCenter: "Skill Center",
  tasks: "Tasks",
  teamMembers: "Team Members",
  tools: "Tools",
  widget: "Widget",
};

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === "askPlatform") return `Ask ${values?.platformName ?? ""}`;
    return labels[key] ?? key;
  },
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
