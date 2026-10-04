"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAction } from "convex/react";
import { getFunctionName, type FunctionArgs, type FunctionReference, type FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { pageForPath, useSearchConsoleHref } from "./useSearchConsole";

/**
 * What a search's and a page's own screens share: the way back to the list
 * they were opened from — its search, order and page kept, as the Sites
 * record screens return to theirs — how a page's address is written, and
 * what is asked of Google while a screen is open.
 */

/** The address key a record's screen carries its list's own address in. */
export const BACK_KEY = "back";

/** A keyword's or a page's own screen, under the website's section. */
export type RecordSegment = "keywords/keyword" | "pages/page";

/** A link to a record's screen from the screen on show, carrying its address for the way back. */
export function useRecordHref(siteId: string): (segment: RecordSegment, key: string) => string {
  const hrefFor = useSearchConsoleHref(siteId);
  const pathname = usePathname();
  const params = useSearchParams();
  // Only the screen it came from: that screen's own way back is dropped, so the address never grows hop by hop.
  const kept = new URLSearchParams(params.toString());
  kept.delete(BACK_KEY);
  const here = `${pathname}${kept.toString() ? `?${kept.toString()}` : ""}`;
  return (segment, key) => hrefFor(segment, { key, [BACK_KEY]: here });
}

/**
 * The way back from a record's screen, named for where it goes (drawn as
 * "Back to /ai-agency/"): the keyword or page it was opened from, or the
 * list — kept as it was left — or the list itself for a link opened cold.
 */
export function useRecordBack(siteId: string, list: "keywords" | "pages", host: string): { label: string; href: string } {
  const t = useTranslations("searchConsole");
  const params = useSearchParams();
  const hrefFor = useSearchConsoleHref(siteId);
  const back = params.get(BACK_KEY);
  const fromHere = back && back.startsWith(`/app/search-console/${siteId}/`) ? back : null;
  if (!fromHere) return { label: t("record.backTo", { name: t(`menu.${list}`) }), href: hrefFor(list) };
  const [path, query = ""] = fromHere.split("?");
  const key = new URLSearchParams(query).get("key");
  const name = path.endsWith("/keywords/keyword") && key
    ? key
    : path.endsWith("/pages/page") && key
      ? pageLabel(key, host)
      : t(`menu.${pageForPath(path, siteId)}`);
  return { label: t("record.backTo", { name }), href: fromHere };
}

/**
 * A page's address as the tables write it: its path on the site's own host,
 * the host too on any other — and the section it links to, which Google
 * counts as a page of its own, so "…/#types-and-uses" does not read as a
 * second copy of its page (2026-10-04).
 */
export function pageLabel(url: string, host: string): string {
  try {
    const parsed = new URL(url);
    const bare = (text: string) => text.toLowerCase().replace(/^www\./, "");
    const section = (() => {
      try {
        return decodeURIComponent(parsed.hash);
      } catch {
        return parsed.hash;
      }
    })();
    const path = `${parsed.pathname}${parsed.search}${section}`;
    return bare(parsed.hostname) === bare(host) ? path : `${parsed.hostname}${path}`;
  } catch {
    return url;
  }
}

type LiveAction = FunctionReference<"action", "public", Record<string, unknown>, { ok: true } | { ok: false; problem: "NOT_CONNECTED" | "GOOGLE_REFUSED" | "GOOGLE_BUSY" }>;

/**
 * Asks of Google in flight, by action, arguments and attempt: React's
 * development double-run, or two parts of a screen asking the same, share one
 * ask rather than sending Google two (drift fixes, 2026-10-03).
 */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Anything asked of Google while a screen is open (search-console-plan.md
 * §14.3, items 4 and 5) — other dates' lists, one search's or page's days —
 * asked again when what is asked changes. Google out of reach reads as busy.
 */
export function useLiveAsk<Action extends LiveAction>(
  action: Action,
  ask: FunctionArgs<Action> | null,
): { answer: FunctionReturnType<Action> | undefined; retry: () => void } {
  const run = useAction(action);
  const askKey = ask ? JSON.stringify(ask) : null;
  const [attempt, setAttempt] = useState(0);
  const [answered, setAnswered] = useState<{ key: string; answer: FunctionReturnType<Action> } | null>(null);
  // The action by its name: `api.…` gives a new reference each render, which would ask again every render.
  const actionName = getFunctionName(action);
  useEffect(() => {
    if (!askKey) return;
    let live = true;
    const flightKey = `${actionName}|${askKey}#${attempt}`;
    let asked = inFlight.get(flightKey);
    if (!asked) {
      // The ask is the action's own arguments, carried as text so a new object each render asks nothing new.
      asked = (run as unknown as (args: FunctionArgs<Action>) => Promise<FunctionReturnType<Action>>)(JSON.parse(askKey) as FunctionArgs<Action>)
        // Our own server failing is not Google being busy: say so, and offer to ask again.
        .catch(() => ({ ok: false, problem: "FAILED" }) as unknown as FunctionReturnType<Action>)
        .finally(() => inFlight.delete(flightKey));
      inFlight.set(flightKey, asked);
    }
    void asked.then((answer) => {
      if (live) setAnswered({ key: `${askKey}#${attempt}`, answer: answer as FunctionReturnType<Action> });
    });
    return () => {
      live = false;
    };
  }, [actionName, askKey, attempt, run]);
  return {
    answer: answered?.key === `${askKey}#${attempt}` ? answered.answer : undefined,
    retry: () => setAttempt((count) => count + 1),
  };
}
