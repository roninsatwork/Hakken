"use client";

import { createContext, useContext, type ButtonHTMLAttributes, type ReactNode } from "react";
import { canWrite } from "@/src/lib/userRoles";

/**
 * Whether the person looking at an admin screen may change anything.
 *
 * The oversight roles added for the governance layer can read admin surfaces
 * and write nowhere. Hiding their write controls one screen at a time would
 * mean editing every admin page, getting one wrong, and having the next page
 * anyone adds default to showing buttons that fail when pressed.
 *
 * So the rule lives here and the shared admin components consult it. A screen
 * built from `AdminPagePrimaryAction`, `AdminRowIconButton`, `AdminSaveAction`
 * and the modal form actions loses its write controls automatically, and a
 * screen written next year inherits the same behaviour without knowing this
 * exists.
 *
 * This is presentation only. The permission itself is enforced in Convex by the
 * guard each function declared — a screen that forgot to ask would be refused
 * by the backend, not quietly allowed. Nothing here is a security boundary.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */
const AdminWriteAccessContext = createContext<boolean>(true);

export function AdminAccessLevelProvider({
  role,
  children,
}: {
  role: string | undefined | null;
  children: ReactNode;
}) {
  return (
    <AdminWriteAccessContext.Provider value={canWrite(role)}>
      {children}
    </AdminWriteAccessContext.Provider>
  );
}

/**
 * Whether write controls should be shown.
 *
 * Defaults to `true` when no provider is present, so a component rendered
 * outside the admin layout — or in a test — behaves as it always did. The
 * oversight roles cannot reach those surfaces anyway.
 */
export function useCanWriteHere(): boolean {
  return useContext(AdminWriteAccessContext);
}

/**
 * A button that changes something, and disappears for people who cannot.
 *
 * Deliberately a drop-in for `<button>`: same props, same markup, same
 * behaviour for anyone who can write. Around fifty admin screens carry their
 * own bespoke buttons rather than the shared page and table components, and
 * wrapping each one in a conditional would mean rewriting JSX that is often
 * already inside a conditional — the kind of edit that breaks a screen in a way
 * nobody notices until someone opens it. Renaming the tag changes no structure
 * at all.
 *
 * Use it for anything that saves, deletes, submits, approves or otherwise
 * writes. Leave ordinary `<button>` for tabs, filters, dialog dismissals and
 * anything that only navigates — hiding a cancel button traps the reader inside
 * a dialog with no way out.
 */
export function AdminWriteButton({
  children,
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const canWriteHere = useCanWriteHere();

  if (!canWriteHere) return null;

  return <button {...buttonProps}>{children}</button>;
}
