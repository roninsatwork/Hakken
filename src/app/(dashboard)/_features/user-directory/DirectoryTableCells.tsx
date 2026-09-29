"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";

/**
 * The cells a people directory draws, shared between the platform's user
 * screen (`admin/users`) and a company's own team screen
 * (`app/settings/team`). Both tables list the same two kinds of row — a
 * person, and an invitation that is not a person yet — and were drawing
 * them twice, letter for letter.
 *
 * These are cells, not columns: which columns a directory shows (the
 * platform adds Workspace; a company hides your own row's actions) stays
 * each screen's own decision, along with every word on the screen — labels
 * arrive as props so each page keeps its own translations.
 */

/** A pending invitation's identity: a dashed placeholder avatar, then the email. */
export function DirectoryInviteIdentityCell({
  pendingLabel,
  email,
}: {
  pendingLabel: ReactNode;
  email: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-black border border-brand/20 border-dashed flex items-center justify-center">
        <span className="text-[9px] font-mono text-brand/50 uppercase tracking-widest">PND</span>
      </div>
      <div>
        <span className="font-medium text-[13px] text-foreground/70 block leading-tight">
          {pendingLabel}
        </span>
        <span className="text-[12px] text-secondary">{email}</span>
      </div>
    </div>
  );
}

/** A person's identity: avatar, name (a link when the screen has a profile to open), email. */
export function DirectoryUserIdentityCell({
  user,
  alt,
  href,
}: {
  user: { _id: string; name?: string | null; email?: string | null; image?: string | null };
  alt: string;
  href?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Image
        src={user.image || `https://api.dicebear.com/7.x/notionists/svg?seed=${user.name ?? user.email ?? user._id}`}
        alt={alt}
        width={32}
        height={32}
        unoptimized
        className="w-8 h-8 rounded-full bg-card border border-border-dim"
      />
      <div>
        {href ? (
          <Link href={href} className="font-medium text-[13px] text-foreground hover:text-brand transition-colors block leading-tight">
            {user.name}
          </Link>
        ) : (
          <span className="font-medium text-[13px] text-foreground block leading-tight">
            {user.name}
          </span>
        )}
        <span className="text-[12px] text-secondary">{user.email}</span>
      </div>
    </div>
  );
}

/** A role said in words — "Administrator", not the stored `ADMIN`. */
export function useRoleWord() {
  const t = useTranslations("admin.users.roles");
  return (role: string | undefined) => {
    switch (role) {
      case "SUPER_ADMIN": return t("superAdmin");
      case "ADMIN": return t("admin");
      case "READ_ONLY": return t("readOnly");
      case "AUDITOR": return t("auditor");
      default: return t("user");
    }
  };
}

/**
 * An invitation's role while it waits to be accepted: a clock, then the
 * words. Every people list — the directory, Team, a company's users, super
 * admins — draws its roles with these two, never a pill of its own.
 */
export function DirectoryInviteRoleLabel({ children }: { children: ReactNode }) {
  return <StatusLabel tone="info" icon="waiting">{children}</StatusLabel>;
}

/** A person's role: the shield for an admin, a person otherwise, then the words. */
export function DirectoryUserRoleLabel({ isAdmin, label }: { isAdmin: boolean; label: ReactNode }) {
  return <StatusLabel tone="neutral" icon={isAdmin ? "admin" : "member"}>{label}</StatusLabel>;
}

/** Muted secondary text in a cell — joined dates, workspace names. */
export function DirectoryTextCell({ children }: { children: ReactNode }) {
  return <span className="text-[12px] text-secondary">{children}</span>;
}

/** The actions on an invitation row: an "awaiting" marker and the revoke bin. */
export function DirectoryInviteAwaitingActions({
  awaitingLabel,
  revokeLabel,
  onRevoke,
}: {
  awaitingLabel: ReactNode;
  revokeLabel: string;
  onRevoke: () => void;
}) {
  return (
    <RowActions>
      <span className="text-[11px] font-mono text-brand/50 uppercase tracking-widest mr-2">
        {awaitingLabel}
      </span>
      <RowIconButton onClick={onRevoke} tone="danger" label={revokeLabel}>
        <Trash2 className="w-4 h-4" />
      </RowIconButton>
    </RowActions>
  );
}
