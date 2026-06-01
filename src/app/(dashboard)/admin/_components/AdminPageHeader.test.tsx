import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminPageHeader, AdminPagePrimaryAction } from "./AdminPageHeader";

describe("AdminPageHeader", () => {
  it("renders the shared title, description, icon, and action", () => {
    render(
      <AdminPageHeader
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
    render(<AdminPageHeader icon={<span aria-hidden="true">Icon</span>} title="Companies" />);

    expect(screen.getByRole("heading", { name: "Companies" })).toBeInTheDocument();
    expect(screen.queryByText("Manage your agents")).not.toBeInTheDocument();
  });
});

describe("AdminPagePrimaryAction", () => {
  it("uses button semantics and forwards click handling", () => {
    const onClick = vi.fn();

    render(
      <AdminPagePrimaryAction icon={<span aria-hidden="true">Plus</span>} onClick={onClick}>
        New agent
      </AdminPagePrimaryAction>
    );

    const action = screen.getByRole("button", { name: "New agent" });
    expect(action).toHaveAttribute("type", "button");

    fireEvent.click(action);

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
