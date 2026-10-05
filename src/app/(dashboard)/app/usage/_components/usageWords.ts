"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CreditKind } from "@/convex/creditKinds";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { formatDate, formatTime } from "@/src/lib/dates";

/**
 * The words and numbers every Usage screen shares
 * (docs/plans/active/usage-credits-plan.md, step 3): a kind of work's name
 * and price, how often a check runs, a month, a date and a time.
 */

/** The kinds of work in the order the menus list them. */
export const CREDIT_KIND_ORDER: readonly CreditKind[] = ["rankings", "aiAnswers", "keywordResearch", "siteAudit", "backlinks", "assistant"];

export type UsageWebsite = { websiteId: string; host: string; relationship: "owned" | "tracked"; iconUrl: string | null };

export function useUsageWords() {
  const t = useTranslations("usage");
  const locale = useLocale();
  const { platformName } = useSystemSettings();
  const number = (value: number) => value.toLocaleString(locale);
  return {
    t,
    number,
    kind: (kind: CreditKind) => t(`kinds.${kind}`, { platformName }),
    price: (kind: CreditKind, price: { credits: number; per: number }) => t(`prices.${kind}`, { credits: price.credits, per: price.per }),
    /** How often a scheduled check runs; null for work started by hand. */
    often: (everyDays: number | null) => {
      if (everyDays === null) return t("often.byHand");
      if (everyDays === 1) return t("often.day");
      if (everyDays === 7) return t("often.week");
      if (everyDays >= 28 && everyDays <= 31) return t("often.month");
      return t("often.days", { count: everyDays });
    },
    /** `YYYY-MM` as its month and year: "October 2026". */
    month: (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1)).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" }),
    /** A batch's month by name alone: "October". */
    monthName: (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1)).toLocaleDateString(locale, { month: "long", timeZone: "UTC" }),
    date: (at: number) => formatDate(at),
    time: (at: number) => formatTime(at, { options: { hour: "2-digit", minute: "2-digit" } }),
  };
}

export type UsageWords = ReturnType<typeof useUsageWords>;

/** The month a Usage screen shows, kept in its address (`?month=YYYY-MM`) so it survives moving between them. */
export function useUsageMonth() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const chosen = params.get("month");
  const month = chosen && /^\d{4}-(0[1-9]|1[0-2])$/.test(chosen) ? chosen : undefined;
  const setMonth = (next: string | undefined) => {
    const search = new URLSearchParams(params.toString());
    if (next) search.set("month", next);
    else search.delete("month");
    const query = search.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };
  /** This screen's address for another Usage screen, keeping the month. */
  const withMonth = (href: string) => (month ? `${href}${href.includes("?") ? "&" : "?"}month=${month}` : href);
  return { month, setMonth, withMonth };
}

/** The last twelve months, newest first, as `YYYY-MM`. */
export function recentMonths(now: number, count = 12): string[] {
  const date = new Date(now);
  return Array.from({ length: count }, (_, index) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - index, 1)).toISOString().slice(0, 7));
}

/** Who a website is to the company, in the words of the Usage screens. */
export function relationshipWord(words: UsageWords, website: UsageWebsite | null): string {
  if (!website) return "–";
  return website.relationship === "owned" ? words.t("websites.owned") : words.t("websites.tracked");
}
