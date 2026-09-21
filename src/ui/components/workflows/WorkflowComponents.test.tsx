import React from "react";
import { fireEvent, renderWithProviders as render, screen, waitFor } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import { AgentEditorModal } from "./AgentEditorModal";
import { AgentNode } from "./AgentNode";
import { ConfigDrawer } from "./ConfigDrawer";
import { GenericNode } from "./GenericNode";
import { WorkflowSidebar } from "./WorkflowSidebar";

// The screen reads the configured platform name, so copy is branded per
// deployment rather than carrying a hardcoded product name.
vi.mock("@/src/context/SystemSettingsContext", () => ({
  useSystemSettings: () => ({ platformName: "Acme Copilot" }),
}));


vi.mock("@xyflow/react", () => ({
  Handle: ({ type }: { type: string }) => <span data-testid={`handle-${type}`} />,
  Position: { Left: "left", Right: "right" },
}));

vi.mock("convex/react", () => ({
  useAction: vi.fn(),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "workflow_1" }),
}));

vi.mock("@/src/ui/components/feedback/HakkenModal", () => ({
  default: ({ children, isOpen, title }: { children: React.ReactNode; isOpen: boolean; title?: string }) =>
    isOpen ? <section aria-label={title ?? "modal"}>{children}</section> : null,
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) => {
        const MotionComponent = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(({ children, ...props }, ref) =>
          React.createElement(tag, { ...props, ref }, children)
        );
        MotionComponent.displayName = `MotionMock(${tag})`;
        return MotionComponent;
      },
    }
  ),
}));

const workflowAgent = {
  _id: "agent_1",
  name: "Research Agent",
  systemPrompt: "Research carefully.",
  inputSchema: "",
  outputSchema: "",
  modelId: "model_default",
  modelSelectionMode: "inherit",
  thinkingMode: false,
  reasoningEffort: "MEDIUM",
  allowInternetAccess: false,
  humanApprovalRequired: false,
  temperature: 1,
  isGlobal: false,
};

const workflowActiveSkills = [
  {
    _id: "skill_research",
    name: "Research Briefing",
    description: "Prepare sourced research briefs.",
    category: "STARTER",
    status: "ACTIVE",
    riskLevel: "MEDIUM",
  },
  {
    _id: "skill_approval",
    name: "Approval Handoff",
    description: "Pause before side-effecting actions.",
    category: "STARTER",
    status: "ACTIVE",
    riskLevel: "HIGH",
  },
];

const workflowSkillBindings = [{
  binding: { _id: "binding_research", isEnabled: true },
  skill: { _id: "skill_research", name: "Research Briefing" },
}];

const workflowModels = [{ modelId: "model_default", friendlyName: "Default Workflow Model", isDefault: true }];

describe("workflow shared components", () => {
  const updateAgent = vi.fn();
  const createInlineAgent = vi.fn();
  const promoteToGlobal = vi.fn();
  const bindSkillToAgent = vi.fn();
  const unbindSkillFromAgent = vi.fn();
  const generateConfig = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAction).mockReturnValue(generateConfig as unknown as ReturnType<typeof useAction>);
    vi.mocked(useMutation).mockImplementation((mutationFn) => {
      const functionName = getFunctionName(mutationFn);
      if (functionName === "agents:updateAgent") return updateAgent as unknown as ReturnType<typeof useMutation>;
      if (functionName === "agents:createInlineAgent") return createInlineAgent as unknown as ReturnType<typeof useMutation>;
      if (functionName === "agents:promoteToGlobal") return promoteToGlobal as unknown as ReturnType<typeof useMutation>;
      if (functionName === "agentSkills:unbindSkillFromAgent") return unbindSkillFromAgent as unknown as ReturnType<typeof useMutation>;
      return bindSkillToAgent as unknown as ReturnType<typeof useMutation>;
    });
    vi.mocked(useQuery).mockImplementation((queryFn, args?) => {
      void args;
      const functionName = getFunctionName(queryFn);
      if (functionName === "agents:get") {
        return workflowAgent as unknown as ReturnType<typeof useQuery>;
      }
      if (functionName === "agentSkills:getActiveSkills") {
        return workflowActiveSkills as unknown as ReturnType<typeof useQuery>;
      }
      if (functionName === "agentSkills:getForAgent") {
        return workflowSkillBindings as unknown as ReturnType<typeof useQuery>;
      }
      if (functionName === "aiModels:getActiveModels") {
        return workflowModels as unknown as ReturnType<typeof useQuery>;
      }
      return [] as unknown as ReturnType<typeof useQuery>;
    });
    updateAgent.mockResolvedValue("agent_1");
    createInlineAgent.mockResolvedValue("agent_1");
    bindSkillToAgent.mockResolvedValue({ bindingId: "binding_1" });
    unbindSkillFromAgent.mockResolvedValue(true);
  });

  it("shows selected central skills on agent nodes", () => {
    const agentNodeProps = {
      id: "agentNode-1",
      data: {
        label: "Research Agent",
        _skillIds: ["skill_research" as Id<"agentSkills">, "skill_approval" as Id<"agentSkills">],
        _skillNames: ["Research Briefing", "Approval Handoff"],
      },
      isConnectable: true,
      selected: false,
    } as unknown as React.ComponentProps<typeof AgentNode>;

    render(
      <AgentNode {...agentNodeProps} />
    );

    expect(screen.getByText("Research Agent")).toBeInTheDocument();
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("Research Briefing")).toBeInTheDocument();
    expect(screen.getByText("Approval Handoff")).toBeInTheDocument();
  });

  it("falls back to live bound skills when agent node data has no saved skill names", () => {
    const agentNodeProps = {
      id: "agentNode-1",
      data: {
        label: "Research Agent",
        _agentId: "agent_1" as Id<"agents">,
      },
      isConnectable: true,
      selected: false,
    } as unknown as React.ComponentProps<typeof AgentNode>;

    render(<AgentNode {...agentNodeProps} />);

    expect(screen.getByText("Research Agent")).toBeInTheDocument();
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("Research Briefing")).toBeInTheDocument();
  });

  it("binds selected central skills when saving workflow agent nodes", async () => {
    const onClose = vi.fn();
    const onUpdateNode = vi.fn();

    render(
      <AgentEditorModal
        node={{
          id: "agentNode-1",
          type: "agentNode",
          position: { x: 0, y: 0 },
          data: {
            label: "Research Agent",
            _agentId: "agent_1" as Id<"agents">,
          },
        }}
        allNodes={[]}
        edges={[]}
        onClose={onClose}
        onUpdateNode={onUpdateNode}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Advanced Engine/i }));
    expect(screen.getByText("Central skills")).toBeInTheDocument();
    expect(screen.getByText("Research Briefing")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Approval Handoff"));
    fireEvent.click(screen.getByRole("button", { name: "Sync Changes" }));

    await waitFor(() => {
      expect(updateAgent).toHaveBeenCalledWith(expect.objectContaining({
        id: "agent_1",
        name: "Research Agent",
      }));
      expect(bindSkillToAgent).toHaveBeenCalledWith({
        agentId: "agent_1",
        skillId: "skill_research",
        isEnabled: true,
        seedEvalFixtures: false,
      });
      expect(bindSkillToAgent).toHaveBeenCalledWith({
        agentId: "agent_1",
        skillId: "skill_approval",
        isEnabled: true,
        seedEvalFixtures: false,
      });
      expect(onUpdateNode).toHaveBeenCalledWith("agentNode-1", expect.objectContaining({
        _skillIds: ["skill_research", "skill_approval"],
        _skillNames: ["Research Briefing", "Approval Handoff"],
      }));
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("unbinds deselected central skills when saving workflow agent nodes", async () => {
    const onClose = vi.fn();
    const onUpdateNode = vi.fn();

    render(
      <AgentEditorModal
        node={{
          id: "agentNode-1",
          type: "agentNode",
          position: { x: 0, y: 0 },
          data: {
            label: "Research Agent",
            _agentId: "agent_1" as Id<"agents">,
          },
        }}
        allNodes={[]}
        edges={[]}
        onClose={onClose}
        onUpdateNode={onUpdateNode}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Advanced Engine/i }));
    fireEvent.click(screen.getByText("Research Briefing"));
    fireEvent.click(screen.getByRole("button", { name: "Sync Changes" }));

    await waitFor(() => {
      expect(unbindSkillFromAgent).toHaveBeenCalledWith({ bindingId: "binding_research" });
      expect(onUpdateNode).toHaveBeenCalledWith("agentNode-1", expect.objectContaining({
        _skillIds: [],
        _skillNames: [],
      }));
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("renders trigger, mapped, configured, and unconfigured node states", () => {
    const { rerender } = render(<GenericNode type="triggerNode" data={{ label: "Manual Trigger" }} />);

    expect(screen.getByText("Manual Trigger")).toBeInTheDocument();
    expect(screen.getByText("trigger Module")).toBeInTheDocument();
    expect(screen.queryByTestId("handle-target")).not.toBeInTheDocument();
    expect(screen.getByTestId("handle-source")).toBeInTheDocument();

    rerender(<GenericNode type="actionNode" data={{ label: "API Call", _inputMapping: "{}" }} />);
    expect(screen.getByText("Data schema bound")).toBeInTheDocument();
    expect(screen.getByTestId("handle-target")).toBeInTheDocument();

    rerender(<GenericNode type="databaseNode" data={{ label: "Write Lead" }} />);
    expect(screen.getByText("Unconfigured Database Node")).toBeInTheDocument();

    rerender(
      <GenericNode
        type="databaseNode"
        data={{ label: "Write Lead", _dbConfig: { operation: "UPDATE", tableName: "leads" } }}
      />
    );
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("UPDATE")).toBeInTheDocument();
    expect(screen.getByText("leads")).toBeInTheDocument();
    expect(screen.getByText("result")).toBeInTheDocument();
  });

  it("renders workflow webhook endpoints from the configured Convex HTTP actions origin", async () => {
    const previousApiUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    const previousSiteUrl = process.env.CONVEX_SITE_URL;
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://sonae-db.ronins.co.uk";
    process.env.CONVEX_SITE_URL = "https://sonae-auth.ronins.co.uk";
    window.history.pushState({}, "", "/admin/workflows/workflow_123");

    try {
      render(
        <ConfigDrawer
          node={{
            id: "triggerNode-1",
            type: "triggerNode",
            position: { x: 0, y: 0 },
            data: {
              label: "Webhook Trigger",
              _triggerType: "WEBHOOK",
            },
          }}
          allNodes={[]}
          edges={[]}
          onClose={vi.fn()}
          onUpdateNode={vi.fn()}
        />
      );

      expect(await screen.findByText(
        "https://sonae-auth.ronins.co.uk/api/webhooks/workflow?workflowId=workflow_123"
      )).toBeInTheDocument();
      expect(screen.queryByText(/sonae-db\.ronins\.co\.uk\/api\/webhooks/)).not.toBeInTheDocument();
    } finally {
      process.env.NEXT_PUBLIC_CONVEX_URL = previousApiUrl;
      process.env.CONVEX_SITE_URL = previousSiteUrl;
    }
  });

  it("renders the node library, supports drag metadata, and closes", () => {
    const onClose = vi.fn();
    const setData = vi.fn();
    const dataTransfer = {
      effectAllowed: "",
      setData,
    };

    const { rerender } = render(<WorkflowSidebar isOpen={false} onClose={onClose} />);

    expect(screen.queryByText("Node Library")).not.toBeInTheDocument();

    rerender(<WorkflowSidebar isOpen onClose={onClose} />);

    fireEvent.dragStart(screen.getByText("API Action").closest("[draggable]") as HTMLElement, {
      dataTransfer,
    });
    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByText("Node Library")).toBeInTheDocument();
    expect(screen.getByText("Database Action")).toBeInTheDocument();
    expect(setData).toHaveBeenCalledWith("application/reactflow", "actionNode");
    expect(setData).toHaveBeenCalledWith("application/reactflow-label", "API Action");
    expect(dataTransfer.effectAllowed).toBe("move");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
