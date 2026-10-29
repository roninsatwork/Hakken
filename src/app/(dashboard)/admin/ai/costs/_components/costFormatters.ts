/**
 * Spend, in **US dollars**.
 *
 * These used to print a "£". The model catalogue stores each provider's own
 * published dollar price and nothing in the product converts, so the pound sign
 * was decoration on a dollar figure — and the one place that did convert used a
 * hardcoded exchange rate that went stale the day it was written.
 */
export function formatUsdAmount(value: number, digits = 4) {
  return `$${value.toLocaleString("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatSmallUsdAmount(value: number | undefined, digits = 5) {
  const safeValue = value ?? 0;
  if (safeValue < 0.00001 && safeValue > 0) return "$< 0.00001";

  return `$${safeValue.toLocaleString("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatCostAxisTick(value: number | string) {
  return formatUsdAmount(Number(value || 0), 4);
}

export function formatTokenAxisTick(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(0)}k` : String(value);
}

export function getAgentMessageCount(interactions?: number, messages?: number) {
  return interactions || messages || 0;
}

/**
 * A pie with one slice per use case ran to seventy slices on 2026-10-29, and
 * its legend spilled over the card above (Anthony: "wow whats happened here").
 * Six colours is all the pie has, so it keeps the biggest five and folds the
 * rest into one named slice, counts and cost added up.
 */
export function foldSmallSlices<T extends { name: string; calls: number; cost: number }>(
  rows: T[],
  keep: number,
  otherName: (folded: number) => string,
): T[] {
  if (rows.length <= keep) return rows;
  const sorted = [...rows].sort((a, b) => b.calls - a.calls);
  const kept = sorted.slice(0, keep - 1);
  const rest = sorted.slice(keep - 1);
  const other = {
    ...rest[0],
    name: otherName(rest.length),
    calls: rest.reduce((sum, row) => sum + row.calls, 0),
    cost: rest.reduce((sum, row) => sum + row.cost, 0),
  };
  return [...kept, other];
}
