"use client";

import { useEffect } from "react";
import { useMutation } from "convex/react";
import { usePathname } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { seenAdvice, type Seen } from "@/convex/utils/hakkenSees";
import { useAdminAction } from "@/src/hooks/useAdminAction";

/** Boxes already saved this visit: each screen's advice once a day, not once a render. */
const noted = new Set<string>();

/**
 * A screen's What Hakken sees saved as it shows (search-console-volatility-
 * plan.md §8, HS5; `hakkenAdvice.ts`): so Ask Hakken says what the screen
 * says, and the company keeps a record of what Hakken advised. `screen` is
 * the box's words — "searchConsole.seen.volatility". The server takes only
 * the screen's own sentences; a save that fails is tried again next time.
 */
export function useNoteAdvice(siteId: Id<"companyWebsites"> | null | undefined, screen: string, seen: Seen | null | undefined, currency?: string | null) {
  const note = useMutation(api.hakkenAdvice.noteAdvice);
  const action = useAdminAction({ scope: "hakken-advice" });
  const path = usePathname() ?? "";
  const day = new Date().toISOString().slice(0, 10);
  const key = siteId && seen && seen.says.length > 0 ? `${siteId}|${screen}|${day}|${seenAdvice(seen)}|${JSON.stringify(seen)}` : null;
  useEffect(() => {
    if (!key || !siteId || !seen || noted.has(key) || !path.startsWith("/app/")) return;
    noted.add(key);
    // Nobody pressed anything: a failure is reported once, never shown, and tried again the next time the box shows.
    void action
      .run(() => note({ siteId, screen, path, seen, ...(currency ? { currency } : {}) }), { key, suppressErrorToast: true, backgroundRetry: true })
      .then((outcome) => {
        if (!outcome.ok) noted.delete(key);
      });
    // The key holds the box and the day: a new box, or a new day, saves again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
