import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { NextIntlClientProvider } from "next-intl";
import { renderWithProviders as renderBase } from "@/src/test/renderWithProviders";
import messages from "../../../../../../../../../messages/en.json";

// The rule form resolves its copy through the catalogue, so the page renders
// inside the same intl provider the root layout supplies.
function renderWithProviders(ui: React.ReactElement) {
  return renderBase(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}
import { routeParams } from "@/src/test/routeParams";
import EditCompanyRulePage from "./page";

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

const NAME = "For example: Office address";
const TRIGGER = "For example: where are you based, what is your address";
const INSTRUCTION = "For example: Tell them our office is in London and offer to book a visit.";
const SUBMIT = "Save changes";

const COMPANY_ID = "company_1234567890" as Id<"companies">;
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

describe("EditCompanyRulePage", () => {
  const updateRuleMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    updateRuleMock.mockResolvedValue(null);
    vi.mocked(useMutation).mockReturnValue(updateRuleMock as unknown as ReturnType<typeof useMutation>);
    vi.mocked(useQuery).mockReturnValue(savedRule as unknown as ReturnType<typeof useQuery>);
  });

  const show = async () =>
    renderWithProviders(await EditCompanyRulePage({ params: routeParams({ id: COMPANY_ID, ruleId: RULE_ID }) }));

  it("opens with the saved rule already in the boxes", async () => {
    await show();

    expect(screen.getByPlaceholderText(NAME)).toHaveValue("Geography Extraction");
    expect(screen.getByPlaceholderText(TRIGGER)).toHaveValue("where are you based");
    expect(screen.getByPlaceholderText(INSTRUCTION)).toHaveValue("Answer with the London office address.");
  });

  it("saves an edit against the rule it opened, trimmed", async () => {
    await show();

    fireEvent.change(screen.getByPlaceholderText(NAME), { target: { value: "  Office location  " } });
    fireEvent.click(screen.getByRole("button", { name: "CRITICAL" }));
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
    await show();

    fireEvent.change(screen.getByPlaceholderText(NAME), { target: { value: "Office location" } });
    fireEvent.change(screen.getByPlaceholderText(TRIGGER), { target: { value: "where is your office" } });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    await waitFor(() => expect(updateRuleMock).toHaveBeenCalled());
    expect(updateRuleMock.mock.calls[0][0]).toMatchObject({
      name: "Office location",
      trigger: "where is your office",
    });
  });

  it("will not save once a box has been emptied", async () => {
    await show();

    expect(screen.getByRole("button", { name: SUBMIT })).toBeEnabled();
    fireEvent.change(screen.getByPlaceholderText(TRIGGER), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: SUBMIT })).toBeDisabled();
  });

  /**
   * True only since the screen moved onto the shared field. All three labels
   * were loose text before, so clicking one focused nothing and a screen reader
   * announced three unlabelled boxes.
   */
  it("gives every box a label that addresses it", async () => {
    await show();

    expect(screen.getByLabelText("What to call this rule")).toBe(screen.getByPlaceholderText(NAME));
    expect(screen.getByLabelText("Words or phrases that set it off")).toBe(screen.getByPlaceholderText(TRIGGER));
    expect(screen.getByLabelText("The instruction, in your own words")).toBe(screen.getByPlaceholderText(INSTRUCTION));
  });

  /**
   * The rule belongs to one customer, so saving it must return to that
   * customer's rules rather than to the platform-wide list.
   */
  it("returns to the company's rules once the edit is saved", async () => {
    await show();

    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(`/admin/companies/${COMPANY_ID}/ai/rules`));
  });
});
