import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { renderWithProviders } from "@/src/test/renderWithProviders";
import { routeParams } from "@/src/test/routeParams";
import NewAgentRulePage from "./page";

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
}));

const FORM = "admin.agents.details.rules.form";
const NAME = "For example: Office address";
const TRIGGER = `${FORM}.trigger.placeholder`;
const INSTRUCTION = `${FORM}.instruction.placeholder.new`;
const SUBMIT = `${FORM}.create.submit`;

const AGENT_ID = "agent_1234567890" as Id<"agents">;

describe("NewAgentRulePage", () => {
  const createRuleMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    createRuleMock.mockResolvedValue("rule_new");
    vi.mocked(useMutation).mockReturnValue(createRuleMock as unknown as ReturnType<typeof useMutation>);
  });

  const show = () => renderWithProviders(<NewAgentRulePage params={routeParams({ id: AGENT_ID })} />);

  const fillIn = () => {
    fireEvent.change(screen.getByPlaceholderText(NAME), { target: { value: "  Geography Extraction  " } });
    fireEvent.change(screen.getByPlaceholderText(TRIGGER), { target: { value: "  where are you based  " } });
    fireEvent.change(screen.getByPlaceholderText(INSTRUCTION), {
      target: { value: "  Answer with the London office address.  " },
    });
  };

  /**
   * The rule has to be created against the agent whose page it was opened from.
   * A rule that arrives without its agent id becomes a platform-wide rule.
   */
  it("creates the rule against the agent it was opened from, trimmed", async () => {
    show();

    fillIn();
    fireEvent.click(screen.getByRole("button", { name: `${FORM}.priority.levels.HIGH` }));
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    await waitFor(() => expect(createRuleMock).toHaveBeenCalled());
    expect(createRuleMock.mock.calls[0][0]).toEqual({
      agentId: AGENT_ID,
      name: "Geography Extraction",
      trigger: "where are you based",
      instruction: "Answer with the London office address.",
      priority: "HIGH",
      isActive: true,
    });
  });

  it("creates a normal-priority rule when the tier is left alone", async () => {
    show();

    fillIn();
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    await waitFor(() => expect(createRuleMock).toHaveBeenCalled());
    expect(createRuleMock.mock.calls[0][0]).toMatchObject({ priority: "NORMAL" });
  });

  it("will not create a rule until all three boxes are filled", () => {
    show();

    expect(screen.getByRole("button", { name: SUBMIT })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(NAME), { target: { value: "Geography Extraction" } });
    fireEvent.change(screen.getByPlaceholderText(TRIGGER), { target: { value: "where are you based" } });
    expect(screen.getByRole("button", { name: SUBMIT })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(INSTRUCTION), {
      target: { value: "Answer with the London office address." },
    });
    expect(screen.getByRole("button", { name: SUBMIT })).toBeEnabled();
  });

  /**
   * True only since the screen moved onto the shared field. All three labels
   * were loose text before, so clicking one focused nothing and a screen reader
   * announced three unlabelled boxes.
   */
  it("gives every box a label that addresses it", () => {
    show();

    expect(screen.getByLabelText("What to call this rule")).toBe(screen.getByPlaceholderText(NAME));
    expect(screen.getByLabelText(`${FORM}.trigger.entity`)).toBe(screen.getByPlaceholderText(TRIGGER));
    expect(screen.getByLabelText(`${FORM}.instruction.context`)).toBe(screen.getByPlaceholderText(INSTRUCTION));
  });

  /**
   * Two boxes both claimed the cursor before, so it landed in the second one.
   */
  it("starts the cursor in the first box", () => {
    show();

    expect(screen.getByPlaceholderText(NAME)).toHaveFocus();
  });

  it("returns to the agent's rules once the rule is created", async () => {
    show();

    fillIn();
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(`/admin/agents/${AGENT_ID}/rules`));
  });
});
