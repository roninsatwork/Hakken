"use client";

import { useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Meter } from "@/src/ui/components/screens/Meter";
import { Notice } from "@/src/ui/components/screens/Notice";
import { formatDay } from "../../sites/_components/siteFormat";
import { useSearchConsoleRange } from "./useSearchConsole";

/**
 * A screen's lists being caught up (`convex/searchConsoleCatchUp.ts`): added
 * up weekly and after the company's own collection, they may end a few days
 * before the newest day collected. A screen reading them then shows what is
 * held at once, asks for them to be added up, and says so here with how far
 * along it is; the lists swap in whole when done and the screen updates itself
 * (Anthony, 2026-10-05 — the picture `catching-up.png`).
 */
export function SearchConsoleCatchUp({ siteId, newestDay }: { siteId: Id<"companyWebsites">; newestDay: string | null | undefined }) {
  const t = useTranslations("searchConsole.catchUp");
  const range = useSearchConsoleRange(newestDay);
  const dates = { siteId, from: range.from, to: range.to };
  const state = useQuery(api.searchConsoleCatchUp.searchConsoleCatchUp, dates);
  const request = useMutation(api.searchConsoleCatchUp.requestSearchConsoleCatchUp);
  const behind = state?.behind === true;
  useEffect(() => {
    // Asked once for these dates; the server asks for the work at most once in ten minutes whoever else is looking.
    if (behind) request({ siteId, from: range.from, to: range.to }).catch(() => undefined);
  }, [behind, request, siteId, range.from, range.to]);
  if (!state?.behind || !state.heldTo || !state.newest) return null;
  const share = state.progress && state.progress.parts > 0 ? state.progress.done / state.progress.parts : 0;
  return (
    <Notice>
      <span className="flex flex-col gap-2">
        <span>
          <span className="font-medium text-foreground">{t("held", { day: formatDay(state.heldTo) })}</span>{" "}
          {t("bringing", { day: formatDay(state.newest) })}
        </span>
        <Meter value={share} size="md" />
      </span>
    </Notice>
  );
}
