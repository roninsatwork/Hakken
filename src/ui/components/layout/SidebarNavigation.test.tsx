import React from "react";
// template:remove:start movement
import { fireEvent } from "@testing-library/react";
// template:remove:end
import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SidebarNavigation from "./SidebarNavigation";

const setIsSidebarOpen = vi.hoisted(() => vi.fn());
const useQueryMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  useMutation: (...args: unknown[]) => useMutationMock(...args),
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    agentRuns: { getPendingApprovalCount: "agentRuns:getPendingApprovalCount" },
    scheduler: { getPendingWorkflowApprovalCount: "scheduler:getPendingWorkflowApprovalCount" },
    companies: { getCompanyById: "companies:getCompanyById" },
    users: { getMe: "users:getMe", impersonateCompany: "users:impersonateCompany" },
  },
}));

vi.mock("@/src/context/UIContext", () => ({
  useUI: () => ({ isSidebarOpen: true, setIsSidebarOpen }),
}));

vi.mock("@/src/context/SystemSettingsContext", () => ({
  useSystemSettings: () => ({
    diagnosticRoutingEnabled: false,
    logoUrlDark: "",
    logoUrlLight: "",
    platformName: "Sonae",
  }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ systemTheme: "dark", theme: "dark" }),
}));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ""} {...props} />
  ),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) => {
        const MotionComponent = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & { layoutId?: string; transition?: unknown }>(
          ({ children, ...props }, ref) => {
            const domProps = { ...props };
            delete domProps.layoutId;
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
  agentApprovals: "Agent Approvals",
  agentSkills: "Agent Skills",
  agents: "Agents",
  ai: "Artificial Intelligence",
  analytics: "Analytics",
  apiKeys: "API Keys",
  authDiagnostics: "Auth Diagnostics",
  chatLogs: "Chat Logs",
  companies: "Companies",
  connectors: "Connectors",
  dashboard: "Dashboard",
  globalKnowledge: "Global Knowledge",
  invitations: "Invitations",
  maintenance: "Maintenance",
  manageAgents: "Manage Agents",
  manageAi: "Manage AI",
  manageGlobalAi: "Manage Global AI",
  manageCompanies: "Manage Companies",
  manageWorkflows: "Manage Workflows",
  models: "Models",
  health: "Health",
  runningCosts: "Running Costs",
  rules: "Rules",
  schedules: "Schedules",
  scripts: "Scripts",
  settings: "Settings",
  systemAdmins: "System Admins",
  systemPrompt: "System Prompt",
  systemSettings: "System Settings",
  webhookDeliveries: "Webhook Deliveries",
};

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => labels[key] ?? key,
}));

describe("SidebarNavigation AI guardrails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMutationMock.mockReturnValue(vi.fn());
    useQueryMock.mockImplementation((queryRef: unknown) => (
      queryRef === "users:getMe" ? { role: "SUPER_ADMIN" } : undefined
    ));
  });

  it("renders Artificial Intelligence with one global AI child and keeps AI pages out of the sidebar", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/ai/usage/costs");

    render(<SidebarNavigation />);

    expect(screen.getByRole("button", { name: "Artificial Intelligence" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage Global AI" })).toHaveAttribute("href", "/admin/ai");
    expect(screen.queryByRole("link", { name: "Manage AI" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Chat Logs" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Rules" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "System Prompt" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Global Knowledge" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Models" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Connectors" })).not.toBeInTheDocument();
  });

  it("does not show the global skill center in the Agents sidebar menu", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/agents");

    render(<SidebarNavigation />);

    expect(screen.getByRole("button", { name: "Agents" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage Agents" })).toHaveAttribute("href", "/admin/agents");
    expect(screen.queryByRole("link", { name: "Agent Skills" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Workflow Logs" })).not.toBeInTheDocument();
  });

  it("shows health in Maintenance instead of Agents", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/health");

    render(<SidebarNavigation />);

    expect(screen.getByRole("button", { name: "Maintenance" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Health" })).toHaveAttribute("href", "/admin/health");
    expect(screen.getByRole("button", { name: "Agents" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Manage Agents" })).not.toBeInTheDocument();
  });

  it("does not reopen the global AI submenu while viewing company AI pages", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/companies/company123/ai/chat-logs");

    render(<SidebarNavigation />);

    expect(screen.getByRole("button", { name: "Artificial Intelligence" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Manage Global AI" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Manage AI" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Running Costs" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Chat Logs" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "System Prompt" })).not.toBeInTheDocument();
  });

  /**
   * A run parked on an approval waits indefinitely, and until this badge existed
   * nothing on the platform said so: the only other mention was a health
   * tile that stays at zero for the first thirty minutes.
   */
  it("shows a count on Agent Approvals when runs are waiting", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/agents");
    useQueryMock.mockImplementation((queryRef: unknown) => {
      if (queryRef === "users:getMe") return { role: "SUPER_ADMIN" };
      if (queryRef === "agentRuns:getPendingApprovalCount") return { count: 3, atLimit: false };
      return undefined;
    });

    render(<SidebarNavigation />);

    const link = screen.getByRole("link", { name: /Agent Approvals/ });
    expect(link).toHaveAttribute("href", "/admin/agents/approvals");
    expect(link).toHaveTextContent("3");
    expect(screen.getByLabelText("3 waiting")).toBeInTheDocument();
  });

  it("hides the count when nothing is waiting", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/agents");
    useQueryMock.mockImplementation((queryRef: unknown) => {
      if (queryRef === "users:getMe") return { role: "SUPER_ADMIN" };
      if (queryRef === "agentRuns:getPendingApprovalCount") return { count: 0, atLimit: false };
      return undefined;
    });

    render(<SidebarNavigation />);

    // A badge that is always there stops being read.
    expect(screen.getByRole("link", { name: /Agent Approvals/ })).not.toHaveTextContent("0");
    expect(screen.queryByLabelText(/waiting/)).not.toBeInTheDocument();
  });

  it("marks the count as approximate once the counting limit is reached", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/agents");
    useQueryMock.mockImplementation((queryRef: unknown) => {
      if (queryRef === "users:getMe") return { role: "SUPER_ADMIN" };
      if (queryRef === "agentRuns:getPendingApprovalCount") return { count: 99, atLimit: true };
      return undefined;
    });

    render(<SidebarNavigation />);

    // Counting cannot be indexed away, so the badge says it stopped counting
    // rather than claiming a precise 99.
    expect(screen.getByLabelText("99+ waiting")).toBeInTheDocument();
  });

  it("does not ask for the count as a company admin, who cannot reach the queue", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/agents");
    useQueryMock.mockImplementation((queryRef: unknown) => (
      queryRef === "users:getMe" ? { role: "ADMIN" } : undefined
    ));

    render(<SidebarNavigation />);

    // The query is super-admin only. Asking anyway would throw on every admin
    // page load for a company admin.
    const countCalls = useQueryMock.mock.calls.filter(([ref]) => ref === "agentRuns:getPendingApprovalCount");
    expect(countCalls.every(([, args]) => args === "skip")).toBe(true);
    expect(screen.queryByRole("link", { name: /Agent Approvals/ })).not.toBeInTheDocument();
  });

  // template:remove:start movement
  it("links Replay Alignment from the Posture Studio submenu", () => {
    vi.mocked(usePathname).mockReturnValue("/demos/movements/replay-lab");

    render(<SidebarNavigation />);

    fireEvent.click(screen.getByRole("button", { name: "Posture Studio" }));

    expect(screen.getByRole("link", { name: "Studio Library" })).toHaveAttribute("href", "/demos/movements");
    expect(screen.getByRole("link", { name: "Replay Alignment" })).toHaveAttribute(
      "href",
      "/demos/movements/replay-lab",
    );
  });
  // template:remove:end
});
