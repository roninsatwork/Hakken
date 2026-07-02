import React from "react";
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
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => <img alt={alt ?? ""} {...props} />,
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
  launch: "App Kits",
  maintenance: "Maintenance",
  manageAgents: "Manage Agents",
  manageAi: "Manage AI",
  manageGlobalAi: "Manage Global AI",
  manageCompanies: "Manage Companies",
  manageWorkflows: "Manage Workflows",
  models: "Models",
  releaseCenter: "Release Center",
  runObservatory: "Run Observatory",
  runningCosts: "Running Costs",
  rules: "Rules",
  schedules: "Schedules",
  scripts: "Scripts",
  settings: "Settings",
  systemAdmins: "System Admins",
  systemHealth: "System Health",
  systemPrompt: "System Prompt",
  systemSettings: "System Settings",
  webhookDeliveries: "Webhook Deliveries",
  workflowLogs: "Workflow Logs",
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
});
