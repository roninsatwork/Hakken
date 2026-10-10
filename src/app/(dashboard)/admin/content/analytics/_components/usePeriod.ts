"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * The period every Analytics screen shares (content-people-knowledge-plan.md,
 * boards 7–12): the last 7, 30 or 90 days or 12 months, kept in the address
 * so it stays as the tabs and rows are opened. Thirty days unless chosen.
 */
export const PERIODS = ["7", "30", "90", "365"] as const;
export type Period = (typeof PERIODS)[number];
export const DEFAULT_PERIOD: Period = "30";

const isPeriod = (value: string | null): value is Period => PERIODS.includes(value as Period);

export function usePeriod(): [Period, (next: Period) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params?.get("period") ?? null;
  const period = isPeriod(raw) ? raw : DEFAULT_PERIOD;
  const choose = (next: Period) => {
    const query = new URLSearchParams(params?.toString() ?? "");
    if (next === DEFAULT_PERIOD) query.delete("period");
    else query.set("period", next);
    const rest = query.toString();
    router.replace(rest ? `${pathname}?${rest}` : pathname);
  };
  return [period, choose];
}

/** An Analytics address that keeps the period chosen. */
export function withPeriod(href: string, period: Period): string {
  return period === DEFAULT_PERIOD ? href : `${href}?period=${period}`;
}
