import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PageHeader, PagePrimaryAction } from "./PageHeader";

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
