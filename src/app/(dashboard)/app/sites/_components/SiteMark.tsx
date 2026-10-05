"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/src/ui/lib/utils";
import { siteInitial } from "./siteGroups";

/**
 * A website's mark in the Sites lists: a rounded square for one the company
 * owns, a circle for a competitor, so the two read apart at a glance. Inside
 * it, the website's icon (`convex/websiteIcons.ts`) — or its letter, where no
 * icon was found or the icon will not load. Its host is always written beside
 * it, so the mark is decoration.
 *
 * The icon sits inset on the tile rather than filling it: a dark icon would
 * otherwise vanish into a dark page, and the tile keeps its shape.
 */
export function SiteMark({
  host,
  owned,
  small = false,
  iconUrl = null,
}: {
  host: string;
  owned: boolean;
  small?: boolean;
  iconUrl?: string | null;
}) {
  const [broken, setBroken] = useState<string | null>(null);
  const icon = iconUrl && iconUrl !== broken ? iconUrl : null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden bg-foreground/10 font-semibold text-foreground",
        owned ? "rounded-[8px]" : "rounded-full",
        small ? "h-5 w-5 text-[10px]" : "h-8 w-8 text-[13px]",
      )}
    >
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element -- a small `data:` image sent with the list; next/image adds nothing here
        <img
          src={icon}
          alt=""
          className={cn("object-contain", small ? "h-3.5 w-3.5" : "h-5 w-5")}
          loading="lazy"
          onError={() => setBroken(icon)}
        />
      ) : (
        siteInitial(host)
      )}
    </span>
  );
}

/**
 * A website named in a table or list cell, its small mark before its name —
 * as the lists of competitors write one. `children` is the name when it is
 * more than the host: a link to its record, or "You (host)".
 */
export function MarkedHost({
  host,
  owned,
  iconUrl = null,
  children,
}: {
  host: string;
  owned: boolean;
  iconUrl?: string | null;
  children?: ReactNode;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <SiteMark host={host} iconUrl={iconUrl} owned={owned} small />
      {children ?? <span className="truncate">{host}</span>}
    </span>
  );
}
