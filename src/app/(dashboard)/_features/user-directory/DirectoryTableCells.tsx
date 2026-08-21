"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ShieldCheck, Trash2, User } from "lucide-react";
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

/** The brand-tinted pill on an invitation's role. */
export function DirectoryInviteRolePill({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-brand/10 border border-brand/20 w-fit">
      <span className="text-[10px] font-mono tracking-widest text-brand uppercase">
        {children}
      </span>
    </div>
  );
}

/** The neutral pill on a person's role, with the shield for admins. */
export function DirectoryUserRolePill({ isAdmin, label }: { isAdmin: boolean; label: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-foreground/5 border border-border-dim w-fit">
      {isAdmin ? <ShieldCheck className="w-3 h-3 text-brand" /> : <User className="w-3 h-3 text-foreground/70" />}
      <span className="text-[10px] font-mono tracking-widest text-foreground/80 uppercase">
        {label}
      </span>
    </div>
  );
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
