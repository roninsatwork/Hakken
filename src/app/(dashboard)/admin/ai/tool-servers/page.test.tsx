import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";
import { renderWithProviders } from "@/src/test/renderWithProviders";
import { getFunctionName } from "convex/server";
import ToolServersPage from "./page";

/**
 * The screen that makes connecting a tool server something an administrator can
 * do rather than a developer.
 *
 * The four actions are deliberately four, not one button: connect a server, ask
 * it what it offers, add its tools, switch it on. What is pinned here is that
 * separation — connecting must not reach out to the server, and asking what it
 * offers must not arm it — because the temptation to collapse them into one
 * "Connect" is exactly what would make adding a server silently give an agent
 * new powers.
 */

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useAction: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => Object.assign(
    (key: string) => `${namespace}.${key}`,
    { rich: (key: string) => `${namespace}.${key}` },
  ),
  NextIntlClientProvider: ({ children }: { children?: React.ReactNode }) => children,
}));

const T = "admin.toolServers";

const server = {
  _id: "server_1" as never,
  _creationTime: 0,
  companyId: "company_1" as never,
  name: "Finance",
  url: "https://finance.example.com/mcp",
  authMode: "NONE" as const,
  status: "DISABLED" as const,
  discoveredToolCount: 3,
  lastDiscoveryAt: 1_700_000_000_000,
  lastDiscoveryMessage: "Found 3 tools.",
  createdAt: 0,
  updatedAt: 0,
};

describe("ToolServersPage", () => {
  const createServer = vi.fn();
  const setServerStatus = vi.fn();
  const deleteServer = vi.fn();
  const importTools = vi.fn();
  const discover = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of [createServer, setServerStatus, deleteServer, importTools, discover]) {
      fn.mockResolvedValue(null);
    }
    vi.mocked(useQuery).mockReturnValue([server] as unknown as ReturnType<typeof useQuery>);
    // Keyed by name, not by identity: `api` is a proxy, so the reference the
    // component holds is not the same object the test built. Keyed by call
    // order would be worse — the screen re-renders on every keystroke.
    const byName: Record<string, unknown> = {
      "mcpServers:createServer": createServer,
      "mcpServers:setServerStatus": setServerStatus,
      "mcpServers:deleteServer": deleteServer,
      "mcpToolPromotion:importServerTools": importTools,
    };
    vi.mocked(useMutation).mockImplementation(((reference: Parameters<typeof getFunctionName>[0]) =>
      byName[getFunctionName(reference)] ?? vi.fn()) as never);
    vi.mocked(useAction).mockReturnValue(discover as never);
  });

  const show = () => renderWithProviders(<ToolServersPage />);

  it("lists a connected server with its address and what it offers", () => {
    show();

    expect(screen.getByText("Finance")).toBeInTheDocument();
    expect(screen.getByText("https://finance.example.com/mcp")).toBeInTheDocument();
    expect(screen.getByText(`${T}.state.DISABLED`)).toBeInTheDocument();
  });

  it("says so plainly when nothing is connected", () => {
    vi.mocked(useQuery).mockReturnValue([] as unknown as ReturnType<typeof useQuery>);
    show();

    expect(screen.getAllByText(`${T}.empty`).length).toBeGreaterThan(0);
  });

  it("connecting a server does not contact it", async () => {
    // The separation this screen exists to keep. Submitting the form stores an
    // address; it must not reach out, because reaching out is the next step and
    // a deliberate one.
    show();

    fireEvent.click(screen.getByRole("button", { name: `${T}.buttons.connect` }));
    const nameInput = await screen.findByPlaceholderText(
      `${T}.placeholders.name`,
      {},
      { timeout: 5_000 },
    );
    fireEvent.change(nameInput, {
      target: { value: "  Warehouse  " },
    });
    fireEvent.change(screen.getByPlaceholderText(`${T}.placeholders.url`), {
      target: { value: "  https://warehouse.example.com/mcp  " },
    });
    fireEvent.submit(nameInput.closest("form")!);

    await waitFor(() => expect(createServer).toHaveBeenCalled());
    expect(createServer.mock.calls[0][0]).toMatchObject({
      name: "Warehouse",
      url: "https://warehouse.example.com/mcp",
      authMode: "NONE",
    });
    expect(discover).not.toHaveBeenCalled();
  });

  it("a credential reference is optional, and typing one says the server needs it", async () => {
    show();

    fireEvent.click(screen.getByRole("button", { name: `${T}.buttons.connect` }));
    const nameInput = await screen.findByPlaceholderText(
      `${T}.placeholders.name`,
      {},
      { timeout: 5_000 },
    );
    fireEvent.change(nameInput, {
      target: { value: "Warehouse" },
    });
    fireEvent.change(screen.getByPlaceholderText(`${T}.placeholders.url`), {
      target: { value: "https://warehouse.example.com/mcp" },
    });
    fireEvent.change(screen.getByPlaceholderText(`${T}.placeholders.secretRef`), {
      target: { value: "vault/warehouse/token" },
    });
    fireEvent.submit(nameInput.closest("form")!);

    await waitFor(() => expect(createServer).toHaveBeenCalled());
    expect(createServer.mock.calls[0][0]).toMatchObject({
      authMode: "SECRET_REF",
      secretRef: "vault/warehouse/token",
    });
  });

  it("asking what a server offers does not add its tools", async () => {
    // Discovery records what a server claims. Letting an agent use it is the
    // separate decision immediately after, made by a person.
    show();

    fireEvent.click(screen.getByRole("button", { name: `${T}.buttons.check` }));

    await waitFor(() => expect(discover).toHaveBeenCalledWith({ serverId: server._id }));
    expect(importTools).not.toHaveBeenCalled();
  });

  it("adding a server's tools is its own action", async () => {
    show();

    fireEvent.click(screen.getByRole("button", { name: `${T}.buttons.addTools` }));

    await waitFor(() => expect(importTools).toHaveBeenCalledWith({ serverId: server._id }));
    expect(discover).not.toHaveBeenCalled();
  });

  it("switches a server on from off", async () => {
    show();

    fireEvent.click(screen.getByRole("button", { name: `${T}.buttons.switchOn` }));

    await waitFor(() => expect(setServerStatus).toHaveBeenCalledWith({
      id: server._id,
      status: "CONNECTED",
    }));
  });

  it("asks before disconnecting, and says what else goes", async () => {
    // Disconnecting removes the server's tools and every agent's binding to
    // them, which is not something to discover after clicking.
    show();

    fireEvent.click(screen.getByRole("button", { name: `${T}.buttons.disconnect` }));

    expect(await screen.findByText(
      `${T}.modal.disconnectDetail`,
      {},
      { timeout: 5_000 },
    )).toBeInTheDocument();
    expect(deleteServer).not.toHaveBeenCalled();
  });

  /**
   * A connection check is a question a person deliberately asked and is waiting
   * on, so it answers in its own right rather than as a line at the top of the
   * page. Pass or fail is stated in a heading; a failure gives the reason and
   * what to do; a pass lists what the server actually offers, because a count is
   * not an answer to whether the connection is worth having.
   */
  describe("the connection check's answer", () => {
    it("says plainly that it worked, and what the server offers", async () => {
      discover.mockResolvedValueOnce({ ok: true, message: "Found 3 tools.", toolCount: 3 });
      vi.mocked(useQuery).mockImplementation((() => [
        { name: "ask_question", title: "Ask a question", description: "Ask about a repository." },
      ]) as never);
      show();

      fireEvent.click(screen.getByRole("button", { name: `${T}.buttons.check` }));

      await waitFor(() => expect(screen.getByText(`${T}.checked.passedTitle`)).toBeInTheDocument());
      expect(screen.getByText("Found 3 tools.")).toBeInTheDocument();
      expect(screen.getByText("Ask a question")).toBeInTheDocument();
    });

    it("says plainly that it failed, with the reason and what to do", async () => {
      // The case that was silent: the backend returns a reason rather than
      // throwing for anything a server does wrong, which is most of it.
      discover.mockResolvedValueOnce({
        ok: false,
        message: "The server did not answer within 15 seconds.",
        toolCount: 0,
      });
      show();

      fireEvent.click(screen.getByRole("button", { name: `${T}.buttons.check` }));

      await waitFor(() => expect(screen.getByText(`${T}.checked.failedTitle`)).toBeInTheDocument());
      expect(screen.getByText("The server did not answer within 15 seconds.")).toBeInTheDocument();
      expect(screen.getByText(`${T}.checked.whatToDo`)).toBeInTheDocument();
    });

    it("reports a check that threw the same way as one that came back", async () => {
      discover.mockRejectedValueOnce(new Error("Something broke."));
      show();

      fireEvent.click(screen.getByRole("button", { name: `${T}.buttons.check` }));

      await waitFor(() => expect(screen.getByText("Something broke.")).toBeInTheDocument());
    });
  });

  /**
   * Every action says what came of it.
   *
   * The first version of this screen said nothing when a check succeeded, and —
   * worse — nothing when it failed either, because a server that will not answer
   * is an outcome the backend *returns* rather than throws, and the screen threw
   * the answer away. Pressing a button and learning nothing is not neutral: it
   * teaches a person the button does not work.
   */
  describe("saying what happened", () => {
    it("says how many tools were added, and that they arrive switched off", async () => {
      importTools.mockResolvedValueOnce({ created: 3, removed: 0 });
      show();

      fireEvent.click(screen.getByRole("button", { name: `${T}.buttons.addTools` }));

      await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
      expect(screen.getByRole("status")).toHaveTextContent(`${T}.notices.toolsAdded`);
    });

    it("confirms switching a server on", async () => {
      show();

      fireEvent.click(screen.getByRole("button", { name: `${T}.buttons.switchOn` }));

      await waitFor(() => expect(screen.getByRole("status"))
        .toHaveTextContent(`${T}.notices.switchedOn`));
    });

    it("can be dismissed", async () => {
      importTools.mockResolvedValueOnce({ created: 3, removed: 0 });
      show();

      fireEvent.click(screen.getByRole("button", { name: `${T}.buttons.addTools` }));
      await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());

      fireEvent.click(screen.getByRole("button", { name: `${T}.buttons.dismiss` }));
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });
});
