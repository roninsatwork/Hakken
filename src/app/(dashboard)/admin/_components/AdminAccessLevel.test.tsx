import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { AdminAccessLevelProvider, AdminWriteButton } from "./AdminAccessLevel";
import { AdminPagePrimaryAction } from "./AdminPageHeader";
import { AdminRowIconButton } from "./AdminTable";
import { AdminSaveAction } from "./AdminSaveControls";

/**
 * The oversight roles read admin screens and write nothing.
 *
 * Hiding their controls screen by screen would mean editing every admin page
 * and having the next page anyone writes default to showing buttons that fail
 * when pressed. The shared components carry the rule instead, so these tests
 * cover every screen built from them at once — including screens that do not
 * exist yet.
 *
 * This is presentation. The permission is enforced in Convex, and
 * `convex/authz.test.ts` is what proves it.
 */
function renderAs(role: string | undefined, ui: React.ReactNode) {
  return render(<AdminAccessLevelProvider role={role}>{ui}</AdminAccessLevelProvider>);
}

describe("admin write controls follow the caller's role", () => {
  test("an administrator sees the primary action", () => {
    renderAs("ADMIN", <AdminPagePrimaryAction>Create agent</AdminPagePrimaryAction>);

    expect(screen.getByRole("button", { name: "Create agent" })).toBeTruthy();
  });

  test("a super admin sees the primary action", () => {
    renderAs("SUPER_ADMIN", <AdminPagePrimaryAction>Create agent</AdminPagePrimaryAction>);

    expect(screen.getByRole("button", { name: "Create agent" })).toBeTruthy();
  });

  test.each(["READ_ONLY", "AUDITOR"])("%s sees no primary action at all", (role) => {
    renderAs(role, <AdminPagePrimaryAction>Create agent</AdminPagePrimaryAction>);

    // Absent rather than disabled: a greyed-out button invites the reader to
    // work out why it will not press.
    expect(screen.queryByRole("button", { name: "Create agent" })).toBeNull();
  });

  test.each(["READ_ONLY", "AUDITOR"])("%s sees no save button", (role) => {
    renderAs(role, <AdminSaveAction isSaving={false} label="Save" savingLabel="Saving" />);

    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
  });

  test.each(["READ_ONLY", "AUDITOR"])("%s sees no delete action on a row", (role) => {
    renderAs(
      role,
      <AdminRowIconButton label="Delete" tone="danger" onClick={vi.fn()}>
        <span />
      </AdminRowIconButton>
    );

    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  test.each(["READ_ONLY", "AUDITOR"])("%s can still open a record, or the list is useless", (role) => {
    renderAs(
      role,
      <AdminRowIconButton navigates label="Configure" onClick={vi.fn()}>
        <span />
      </AdminRowIconButton>
    );

    expect(screen.getByRole("button", { name: "Configure" })).toBeTruthy();
  });

  test("a component rendered with no provider keeps its controls", () => {
    // Everything outside the admin layout must behave exactly as before, or
    // adding these roles would have quietly stripped buttons elsewhere.
    render(<AdminPagePrimaryAction>Create agent</AdminPagePrimaryAction>);

    expect(screen.getByRole("button", { name: "Create agent" })).toBeTruthy();
  });
});

/**
 * `AdminWriteButton` is a drop-in for `<button>` used by the ~50 admin screens
 * that carry their own buttons rather than the shared page and table
 * components. It must behave identically for anyone who can write, or swapping
 * the tag would have changed those screens for everybody.
 */
describe("AdminWriteButton", () => {
  test("behaves exactly like a button for someone who can write", async () => {
    const onClick = vi.fn();
    renderAs(
      "SUPER_ADMIN",
      <AdminWriteButton type="submit" onClick={onClick} className="x" disabled={false}>
        Save changes
      </AdminWriteButton>
    );

    const button = screen.getByRole("button", { name: "Save changes" });
    expect(button.getAttribute("type")).toBe("submit");
    expect(button.className).toBe("x");

    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test.each(["READ_ONLY", "AUDITOR"])("%s never sees it, so it can never be pressed", (role) => {
    const onClick = vi.fn();
    renderAs(role, <AdminWriteButton onClick={onClick}>Delete everything</AdminWriteButton>);

    expect(screen.queryByRole("button", { name: "Delete everything" })).toBeNull();
    expect(onClick).not.toHaveBeenCalled();
  });

  test("outside the admin layout it is an ordinary button", () => {
    render(<AdminWriteButton>Save changes</AdminWriteButton>);

    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
  });
});
