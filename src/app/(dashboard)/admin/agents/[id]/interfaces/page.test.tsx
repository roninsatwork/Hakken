import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import AgentInterfacesPage from "./page";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "agent_1" }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const agent = {
  _id: "agent_1",
  name: "Sales Report Agent",
  outputSchema: undefined as string | undefined,
};

const tool = {
  _id: "tool_1",
  name: "Knowledge Search",
  description: "Searches approved internal knowledge sources.",
  requiredRole: "ADMIN",
  handlerMapping: "knowledge.search",
};

describe("AgentInterfacesPage", () => {
  const mutationMock = vi.fn();
  let toolsFixture: unknown;
  let boundFixture: unknown;
  let agentFixture: unknown;

  const renderPage = () => render(<AgentInterfacesPage />);

  beforeEach(() => {
    vi.clearAllMocks();
    agentFixture = agent;
    toolsFixture = [tool];
    boundFixture = [];
    vi.mocked(useQuery).mockImplementation((queryFn, args?) => {
      void args;
      const name = getFunctionName(queryFn);
      if (name === "agents:get") return agentFixture as ReturnType<typeof useQuery>;
      if (name === "aiTools:getTools") return toolsFixture as ReturnType<typeof useQuery>;
      if (name === "aiTools:getAgentTools") return boundFixture as ReturnType<typeof useQuery>;
      return undefined as unknown as ReturnType<typeof useQuery>;
    });
    vi.mocked(useMutation).mockReturnValue(mutationMock as unknown as ReturnType<typeof useMutation>);
    mutationMock.mockResolvedValue(undefined);
  });

  it("keeps the existing loading state while the answer builder loads", () => {
    renderPage();

    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  it("lists every tool with a switch showing whether this agent has it", async () => {
    renderPage();

    expect(await screen.findByText("Knowledge Search")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Knowledge Search" })).toHaveAttribute("aria-checked", "false");
  });

  it("binds a tool the switch is turned on for", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("switch", { name: "Knowledge Search" }));

    await waitFor(() => {
      expect(mutationMock).toHaveBeenCalledWith({
        agentId: "agent_1",
        toolId: "tool_1",
        action: "BIND",
      });
    });
  });

  it("unbinds a tool the agent already has", async () => {
    boundFixture = [{ ...tool, bindingId: "binding_1" }];
    renderPage();

    const toolSwitch = await screen.findByRole("switch", { name: "Knowledge Search" });
    expect(toolSwitch).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toolSwitch);

    await waitFor(() => {
      expect(mutationMock).toHaveBeenCalledWith({
        agentId: "agent_1",
        toolId: "tool_1",
        action: "UNBIND",
      });
    });
  });

  /**
   * The old empty state read "No tools or integrations mapped to this unit",
   * which says this agent has none. In fact none existed anywhere, and the
   * reader was given nowhere to go about it.
   */
  it("says no tools exist yet, and links to where one is made", async () => {
    toolsFixture = [];
    renderPage();

    // Said twice on purpose since the screen gained page numbers: once in the
    // table and once in the footer's count slot.
    expect((await screen.findAllByText("tools.empty")).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /tools.emptyAction/ }))
      .toHaveAttribute("href", "/admin/ai/tools/new");
  });

  /**
   * The warning used to sit on screen permanently, beside an empty builder,
   * describing something that was not happening.
   */
  it("warns about losing plain English only once fields are actually asked for", async () => {
    renderPage();

    await screen.findByText("tools.title");
    expect(screen.queryByText("answer.warning")).not.toBeInTheDocument();
  });

  it("shows the warning when the agent already has an answer shape", async () => {
    agentFixture = { ...agent, outputSchema: JSON.stringify({ type: "object", properties: { total: { type: "number" } } }) };
    renderPage();

    expect(await screen.findByText("answer.warning")).toBeInTheDocument();
  });

  it("saves the answer shape without touching anything else on the agent", async () => {
    agentFixture = { ...agent, outputSchema: JSON.stringify({ type: "object", properties: { total: { type: "number" } } }) };
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /answer.saveButton/ }));

    await waitFor(() => {
      const payload = mutationMock.mock.calls.map(([p]) => p).find((p) => p && "outputSchema" in p);
      expect(payload).toBeDefined();
      expect(payload).not.toHaveProperty("inputSchema");
    });
  });
});
