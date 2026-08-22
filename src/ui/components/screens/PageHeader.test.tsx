import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DetailHeader, PageHeader, PagePrimaryAction } from "./PageHeader";

/**
 * The rule the header components draw under themselves.
 *
 * Asserted as the literal recipe because that is what the build guard
 * (scripts/check-screen-kit.mjs) forbids screens from writing by hand: if the
 * components stopped drawing it, every screen would lose its line at once and
 * the only thing standing between the app and that is this assertion.
 */
const HEADER_RULE = ["border-b", "border-border-dim", "pb-6"];

function headerBlockOf(heading: HTMLElement) {
  return heading.closest("div")?.parentElement;
}

describe("PageHeader", () => {
  it("renders the shared title, description, icon, and action", () => {
    render(
      <PageHeader
        icon={<span aria-hidden="true">Icon</span>}
        title="Agents"
        description="Manage your agents"
        action={<button type="button">Create</button>}
      />
    );

    expect(screen.getByRole("heading", { name: "Agents" })).toBeInTheDocument();
    expect(screen.getByText("Manage your agents")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  it("omits the description when none is provided", () => {
    render(<PageHeader icon={<span aria-hidden="true">Icon</span>} title="Companies" />);

    expect(screen.getByRole("heading", { name: "Companies" })).toBeInTheDocument();
    expect(screen.queryByText("Manage your agents")).not.toBeInTheDocument();
  });

  it("draws the rule only when the page asks for it", () => {
    const { rerender } = render(
      <PageHeader icon={<span aria-hidden="true">Icon</span>} title="Users" />
    );
    expect(headerBlockOf(screen.getByRole("heading", { name: "Users" }))).not.toHaveClass(
      ...HEADER_RULE
    );

    rerender(<PageHeader icon={<span aria-hidden="true">Icon</span>} title="Users" divider />);
    expect(headerBlockOf(screen.getByRole("heading", { name: "Users" }))).toHaveClass(
      ...HEADER_RULE
    );
  });

  it("puts pills under the description, never inside the title", () => {
    render(
      <PageHeader
        icon={<span aria-hidden="true">Icon</span>}
        title="Rebuild inventory rollup"
        description="Recalculates the overview metrics."
        pills={<span>LOW risk</span>}
      />
    );

    const heading = screen.getByRole("heading", { name: /Rebuild inventory rollup/ });
    const pill = screen.getByText("LOW risk");

    expect(heading).not.toContainElement(pill);
    // Following the description in document order is what keeps the title row
    // readable; a pill promoted into the title is the drift this catches.
    expect(
      screen.getByText("Recalculates the overview metrics.").compareDocumentPosition(pill)
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});

describe("DetailHeader", () => {
  it("puts the back row before the title, and always draws the rule", () => {
    render(
      <DetailHeader
        back={{ label: "Back to rules", href: "/admin/ai/rules" }}
        icon={<span aria-hidden="true">Icon</span>}
        title="Add a rule"
        description="Tell the assistant what to do."
      />
    );

    const back = screen.getByRole("link", { name: /Back to rules/ });
    const heading = screen.getByRole("heading", { name: /Add a rule/ });

    expect(back).toHaveAttribute("href", "/admin/ai/rules");
    expect(back.compareDocumentPosition(heading)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    // The back row is its own line above the title — Detail A, chosen
    // 2026-08-22 — so the title starts at the left edge like every other page.
    expect(heading).not.toContainElement(back);
    expect(headerBlockOf(heading)).toHaveClass(...HEADER_RULE);
  });

  it("takes a handler for a back that has no address of its own", () => {
    const onClick = vi.fn();

    render(
      <DetailHeader
        back={{ label: "Back", onClick }}
        icon={<span aria-hidden="true">Icon</span>}
        title="Edit schedule"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Back/ }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("PagePrimaryAction", () => {
  it("uses button semantics and forwards click handling", () => {
    const onClick = vi.fn();

    render(
      <PagePrimaryAction icon={<span aria-hidden="true">Plus</span>} onClick={onClick}>
        New agent
      </PagePrimaryAction>
    );

    const action = screen.getByRole("button", { name: "New agent" });
    expect(action).toHaveAttribute("type", "button");

    fireEvent.click(action);

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
