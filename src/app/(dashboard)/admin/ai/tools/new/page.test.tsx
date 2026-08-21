import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation } from "convex/react";
import { renderWithProviders } from "@/src/test/renderWithProviders";
import { expectStandardFormScreen } from "@/src/test/standardFormScreen";
import RegisterToolPage from "./page";

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

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
  // renderWithProviders wraps every screen in the provider, so the mocked
  // module has to export it too — as a pass-through.
  NextIntlClientProvider: ({ children }: { children?: React.ReactNode }) => children,
}));

const NEW = "admin.aiTools.new";
const NAME = `${NEW}.fields.name.placeholder`;
const HANDLER = `${NEW}.fields.handler.placeholder`;
const DESCRIPTION = `${NEW}.fields.description.placeholder`;
const OUTPUT_SCHEMA = 'Optional: {"type":"object","properties":{}}';
const SUBMIT = `${NEW}.submit`;

const DEFAULT_INPUT_SCHEMA = '{\n  "type": "object",\n  "properties": {}\n}';

describe("RegisterToolPage", () => {
  const createToolMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    createToolMock.mockResolvedValue("tool_new");
    vi.mocked(useMutation).mockReturnValue(createToolMock as unknown as ReturnType<typeof useMutation>);
  });

  const fillIn = () => {
    fireEvent.change(screen.getByPlaceholderText(NAME), { target: { value: "check_stock" } });
    fireEvent.change(screen.getByPlaceholderText(HANDLER), { target: { value: "  api.stock.check  " } });
    fireEvent.change(screen.getByPlaceholderText(DESCRIPTION), {
      target: { value: "  Looks up how many of an item are left.  " },
    });
  };

  it("creates the tool from what was typed, trimmed", async () => {
    renderWithProviders(<RegisterToolPage />);

    fillIn();
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    await waitFor(() => expect(createToolMock).toHaveBeenCalled());
    expect(createToolMock.mock.calls[0][0]).toMatchObject({
      name: "check_stock",
      handlerMapping: "api.stock.check",
      description: "Looks up how many of an item are left.",
      requiredRole: "ADMIN",
      sideEffectLevel: "READ",
      confirmationRequired: false,
      isActive: true,
    });
  });

  /**
   * The name is what the model is handed, so the box rewrites anything typed
   * into it. A capital letter or a space reaching the model would be a tool it
   * cannot call.
   */
  it("forces the name into the shape the model expects", async () => {
    renderWithProviders(<RegisterToolPage />);

    fillIn();
    fireEvent.change(screen.getByPlaceholderText(NAME), { target: { value: "Check Stock Levels!" } });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    await waitFor(() => expect(createToolMock).toHaveBeenCalled());
    expect(createToolMock.mock.calls[0][0]).toMatchObject({ name: "check_stock_levels_" });
  });

  it("sends the schema box as written, and leaves an empty one out entirely", async () => {
    renderWithProviders(<RegisterToolPage />);

    fillIn();
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    await waitFor(() => expect(createToolMock).toHaveBeenCalled());
    expect(createToolMock.mock.calls[0][0]).toMatchObject({
      inputSchema: DEFAULT_INPUT_SCHEMA.trim(),
      outputSchema: undefined,
    });
  });

  it("carries the choices the form offers", async () => {
    renderWithProviders(<RegisterToolPage />);

    fillIn();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "DESTRUCTIVE" } });
    fireEvent.click(screen.getByLabelText("Require approval"));
    fireEvent.click(screen.getByLabelText("Active"));
    fireEvent.click(screen.getByRole("button", { name: "System admin" }));
    fireEvent.change(screen.getByPlaceholderText(OUTPUT_SCHEMA), { target: { value: '{"type":"object"}' } });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    await waitFor(() => expect(createToolMock).toHaveBeenCalled());
    expect(createToolMock.mock.calls[0][0]).toMatchObject({
      sideEffectLevel: "DESTRUCTIVE",
      confirmationRequired: true,
      isActive: false,
      requiredRole: "SUPER_ADMIN",
      outputSchema: '{"type":"object"}',
    });
  });

  it("will not create a tool until it has a name, a description and something to run", () => {
    renderWithProviders(<RegisterToolPage />);

    expect(screen.getByRole("button", { name: SUBMIT })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(NAME), { target: { value: "check_stock" } });
    fireEvent.change(screen.getByPlaceholderText(DESCRIPTION), { target: { value: "Looks up stock." } });
    expect(screen.getByRole("button", { name: SUBMIT })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(HANDLER), { target: { value: "api.stock.check" } });
    expect(screen.getByRole("button", { name: SUBMIT })).toBeEnabled();
  });

  it("meets the floor every form screen has to clear", () => {
    renderWithProviders(<RegisterToolPage />);

    expectStandardFormScreen({ minBoxes: 5 });
  });

  it("returns to the tools list once the tool is created", async () => {
    renderWithProviders(<RegisterToolPage />);

    fillIn();
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/admin/ai/tools"));
  });
});
