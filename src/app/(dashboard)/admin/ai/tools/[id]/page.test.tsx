import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { renderWithProviders } from "@/src/test/renderWithProviders";
import { routeParams } from "@/src/test/routeParams";
import EditToolPage from "./page";

/**
 * Written before the screen moved onto the shared field, so that it pins what
 * the screen does today rather than agreeing with whatever it does afterwards.
 *
 * The boxes are found by their placeholder, not their label. Today's labels are
 * not tied to their inputs at all — that is the fault the shared field exists to
 * fix, so it is the one handle that cannot be used to hold the screen still
 * while it changes.
 */

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const NAME = "e.g. check_inventory_status";
const DESCRIPTION = "Tell the LLM exactly what this tool does and when to use it...";
const HANDLER = "e.g. api.integrations.stripe.createCharge";
const INPUT_SCHEMA = '{"type":"object","properties":{}}';
const OUTPUT_SCHEMA = 'Optional: {"type":"object","properties":{}}';
const SUBMIT = "Commit System Modifications";

const TOOL_ID = "tool_1234567890" as Id<"aiTools">;

const savedTool = {
  _id: TOOL_ID,
  _creationTime: 0,
  name: "check_stock",
  description: "Looks up how many of an item are left.",
  handlerMapping: "api.stock.check",
  requiredRole: "ADMIN" as const,
  inputSchema: '{"type":"object"}',
  outputSchema: "",
  sideEffectLevel: "READ" as const,
  confirmationRequired: false,
  isActive: true,
};

describe("EditToolPage", () => {
  const updateToolMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    updateToolMock.mockResolvedValue(null);
    vi.mocked(useMutation).mockReturnValue(updateToolMock as unknown as ReturnType<typeof useMutation>);
    vi.mocked(useQuery).mockReturnValue(savedTool as unknown as ReturnType<typeof useQuery>);
  });

  const show = () => renderWithProviders(<EditToolPage params={routeParams({ id: TOOL_ID })} />);

  it("opens with the saved tool already in the boxes", () => {
    show();

    expect(screen.getByPlaceholderText(NAME)).toHaveValue("check_stock");
    expect(screen.getByPlaceholderText(DESCRIPTION)).toHaveValue("Looks up how many of an item are left.");
    expect(screen.getByPlaceholderText(HANDLER)).toHaveValue("api.stock.check");
    expect(screen.getByPlaceholderText(INPUT_SCHEMA)).toHaveValue('{"type":"object"}');
  });

  it("saves an edit against the tool it opened, trimmed", async () => {
    show();

    fireEvent.change(screen.getByPlaceholderText(HANDLER), { target: { value: "  api.stock.count  " } });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    await waitFor(() => expect(updateToolMock).toHaveBeenCalled());
    expect(updateToolMock.mock.calls[0][0]).toMatchObject({
      id: TOOL_ID,
      name: "check_stock",
      handlerMapping: "api.stock.count",
      description: "Looks up how many of an item are left.",
    });
  });

  /**
   * Editing one box must not quietly reset the others to the saved values, which
   * is the failure mode of a draft rebuilt from the record on every keystroke.
   */
  it("keeps earlier edits when a second box is changed", async () => {
    show();

    fireEvent.change(screen.getByPlaceholderText(HANDLER), { target: { value: "api.stock.count" } });
    fireEvent.change(screen.getByPlaceholderText(DESCRIPTION), { target: { value: "Counts stock." } });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    await waitFor(() => expect(updateToolMock).toHaveBeenCalled());
    expect(updateToolMock.mock.calls[0][0]).toMatchObject({
      handlerMapping: "api.stock.count",
      description: "Counts stock.",
    });
  });

  /**
   * An empty schema box has to be left out of the call rather than sent as an
   * empty string, or the tool ends up carrying a schema that parses to nothing.
   */
  it("leaves an empty schema box out of the call entirely", async () => {
    show();

    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    await waitFor(() => expect(updateToolMock).toHaveBeenCalled());
    expect(updateToolMock.mock.calls[0][0]).toMatchObject({
      inputSchema: '{"type":"object"}',
      outputSchema: undefined,
    });
  });

  it("carries the choices the form offers", async () => {
    show();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "DESTRUCTIVE" } });
    fireEvent.click(screen.getByLabelText("Require approval"));
    fireEvent.click(screen.getByRole("button", { name: "SUPER_ADMIN" }));
    fireEvent.change(screen.getByPlaceholderText(OUTPUT_SCHEMA), { target: { value: '{"type":"string"}' } });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    await waitFor(() => expect(updateToolMock).toHaveBeenCalled());
    expect(updateToolMock.mock.calls[0][0]).toMatchObject({
      sideEffectLevel: "DESTRUCTIVE",
      confirmationRequired: true,
      requiredRole: "SUPER_ADMIN",
      outputSchema: '{"type":"string"}',
    });
  });

  it("will not save once a required box has been emptied", () => {
    show();

    expect(screen.getByRole("button", { name: SUBMIT })).toBeEnabled();
    fireEvent.change(screen.getByPlaceholderText(HANDLER), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: SUBMIT })).toBeDisabled();
  });

  it("returns to the tools list once the edit is saved", async () => {
    show();

    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/admin/ai/tools"));
  });
});
