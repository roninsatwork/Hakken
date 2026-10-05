"use client";

import { useState } from "react";
import { Select } from "@/src/ui/components/screens/Select";
import { MarkedHost } from "../../sites/_components/SiteMark";
import { recentMonths, useUsageMonth, useUsageWords, type UsageWebsite, type UsageWords } from "./usageWords";

/**
 * Parts the Usage screens share: the month they show, and a
 * website named with its mark — square for one the company owns, round for
 * one it tracks, as the Sites lists draw it.
 */

/** Which month a screen shows: this one unless another is chosen. A view chip, so it stays quiet. */
export function MonthPicker() {
  const words = useUsageWords();
  const { month, setMonth } = useUsageMonth();
  // The months offered are fixed when the chip first draws.
  const [months] = useState(() => recentMonths(Date.now()));
  return (
    <Select
      value={month ?? ""}
      onChange={(next) => setMonth(next || undefined)}
      chip={{ label: month ? words.t("month.label") : words.t("month.thisMonth"), choice: month ? words.month(month) : null }}
      aria-label={words.t("month.label")}
    >
      <option value="">{words.t("month.thisMonth")}</option>
      {months.slice(1).map((value) => (
        <option key={value} value={value}>{words.month(value)}</option>
      ))}
    </Select>
  );
}

/** A website as the Usage screens name it, or the words for work tied to none. */
export function UsageWebsiteName({ website, words }: { website: UsageWebsite | null; words: UsageWords }) {
  if (!website) return <span className="text-[13px] text-secondary">{words.t("websites.none")}</span>;
  return (
    <span className="text-[13px] text-foreground">
      <MarkedHost host={website.host} owned={website.relationship === "owned"} iconUrl={website.iconUrl} />
    </span>
  );
}
