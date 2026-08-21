import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { renderWithProviders } from "@/src/test/renderWithProviders";
import { routeParams } from "@/src/test/routeParams";
import EditAgentRulePage from "./page";

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

vi.mock("next-intl", () => ({
  // renderWithProviders wraps every screen in the provider, so the mocked
  // module has to export it too — as a pass-through.
  NextIntlClientProvider: ({ children }: { children?: React.ReactNode }) => children,
  useTranslations: (namespace: string) => (key: string, values?: Record<string, string | number>) => {
    const full = `${namespace}.${key}`;
    return values?.id !== undefined ? `${full} ${values.id}` : full;
  },
}));

const FORM = "admin.agents.details.rules.form";
const NAME = "admin.agents.details.rules.form.name.placeholder";
const TRIGGER = `${FORM}.trigger.placeholder`;
const INSTRUCTION = `${FORM}.instruction.placeholder.edit`;
const SUBMIT = `${FORM}.edit.submit`;

const AGENT_ID = "agent_1234567890" as Id<"agents">;
const RULE_ID = "rule_1234567890" as Id<"aiRules">;

const savedRule = {
  _id: RULE_ID,
  _creationTime: 0,
  name: "Geography Extraction",
  trigger: "where are you based",
  instruction: "Answer with the London office address.",
  priority: "NORMAL" as const,
  isActive: true,
};

describe("EditAgentRulePage", () => {
  const updateRuleMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    updateRuleMock.mockResolvedValue(null);
    vi.mocked(useMutation).mockReturnValue(updateRuleMock as unknown as ReturnType<typeof useMutation>);
    vi.mocked(useQuery).mockReturnValue(savedRule as unknown as ReturnType<typeof useQuery>);
  });

  const show = () =>
    renderWithProviders(<EditAgentRulePage params={routeParams({ id: AGENT_ID, ruleId: RULE_ID })} />);

  it("opens with the saved rule already in the boxes", () => {
    show();

    expect(screen.getByPlaceholderText(NAME)).toHaveValue("Geography Extraction");
    expect(screen.getByPlaceholderText(TRIGGER)).toHaveValue("where are you based");
    expect(screen.getByPlaceholderText(INSTRUCTION)).toHaveValue("Answer with the London office address.");
  });

  it("saves an edit against the rule it opened, trimmed", async () => {
    show();

    fireEvent.change(screen.getByPlaceholderText(NAME), { target: { value: "  Office location  " } });
    fireEvent.click(screen.getByRole("button", { name: `${FORM}.priority.levels.CRITICAL` }));
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    await waitFor(() => expect(updateRuleMock).toHaveBeenCalled());
    expect(updateRuleMock.mock.calls[0][0]).toEqual({
      id: RULE_ID,
      name: "Office location",
      trigger: "where are you based",
      instruction: "Answer with the London office address.",
      priority: "CRITICAL",
      isActive: true,
    });
  });

  /**
   * Editing one box must not quietly reset the others to the saved values, which
   * is the failure mode of a draft rebuilt from the record on every keystroke.
   */
  it("keeps earlier edits when a second box is changed", async () => {
    show();

    fireEvent.change(screen.getByPlaceholderText(NAME), { target: { value: "Office location" } });
    fireEvent.change(screen.getByPlaceholderText(TRIGGER), { target: { value: "where is your office" } });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    await waitFor(() => expect(updateRuleMock).toHaveBeenCalled());
    expect(updateRuleMock.mock.calls[0][0]).toMatchObject({
      name: "Office location",
      trigger: "where is your office",
    });
  });

  it("will not save once a box has been emptied", () => {
    show();

    expect(screen.getByRole("button", { name: SUBMIT })).toBeEnabled();
    fireEvent.change(screen.getByPlaceholderText(TRIGGER), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: SUBMIT })).toBeDisabled();
  });

  /**
   * True only since the screen moved onto the shared field. All three labels
   * were loose text before, so clicking one focused nothing and a screen reader
   * announced three unlabelled boxes.
   */
  it("gives every box a label that addresses it", () => {
    show();

    expect(screen.getByLabelText("admin.agents.details.rules.form.name.label")).toBe(screen.getByPlaceholderText(NAME));
    expect(screen.getByLabelText(`${FORM}.trigger.entity`)).toBe(screen.getByPlaceholderText(TRIGGER));
    expect(screen.getByLabelText(`${FORM}.instruction.context`)).toBe(screen.getByPlaceholderText(INSTRUCTION));
  });

  it("returns to the agent's rules once the edit is saved", async () => {
    show();

    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(`/admin/agents/${AGENT_ID}/rules`));
  });
});
