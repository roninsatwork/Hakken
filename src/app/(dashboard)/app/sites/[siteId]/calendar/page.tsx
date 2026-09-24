"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/src/ui/components/screens/Button";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { useSiteRange } from "../../_components/SiteDateRange";
import { formatMonth } from "../../_components/siteFormat";
import { shiftMonth } from "../../_components/siteRange";
import { useSiteId } from "../../_components/useSite";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/**
 * Calendar: what changed on each day of a month — rankings won and lost, AI
 * answers that named the site, linking websites gained and lost — from the day
 * summaries. Opens on the month the chosen dates end in.
 */
export default function SiteCalendarPage() {
  const t = useTranslations("sites.calendar");
  const siteId = useSiteId();
  const range = useSiteRange();
  const [month, setMonth] = useState(range.to.slice(0, 7));
  const days = useQuery(api.siteCharts.siteCalendar, { siteId, month });
  const byDay = new Map((days ?? []).map((entry) => [entry.day, entry]));

  const first = new Date(`${month}-01T00:00:00Z`);
  const lead = (first.getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<CalendarDays className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={t("description")}
        action={
          <div className="flex items-center gap-2">
            <Button variant="quiet" aria-label={t("previous")} onClick={() => setMonth((current) => shiftMonth(current, -1))} className="p-1.5">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[9rem] text-center text-[13px] text-foreground">{formatMonth(month)}</span>
            <Button variant="quiet" aria-label={t("next")} onClick={() => setMonth((current) => shiftMonth(current, 1))} className="p-1.5">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {days !== undefined && days.length === 0 ? (
        <p className="rounded-xl border border-border-dim bg-card/40 px-4 py-6 text-center text-[13px] text-secondary">{t("empty")}</p>
      ) : null}

      <div className="grid grid-cols-7 gap-1.5" aria-busy={days === undefined}>
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} className="px-2 pb-1 text-[11px] uppercase tracking-wider text-muted">{t(`weekdays.${weekday}`)}</div>
        ))}
        {cells.map((day, index) => {
          if (!day) return <div key={`lead-${index}`} />;
          const entry = byDay.get(day);
          return (
            <div key={day} className="flex min-h-[88px] flex-col gap-0.5 rounded-lg border border-border-dim bg-card/40 px-2 py-1.5 text-[11px]">
              <span className="text-secondary">{Number(day.slice(8))}</span>
              {entry ? (
                <>
                  {entry.rankedUp > 0 ? <span className="text-success">{t("up", { count: entry.rankedUp })}</span> : null}
                  {entry.rankedDown > 0 ? <span className="text-destructive">{t("down", { count: entry.rankedDown })}</span> : null}
                  {entry.rankedNew > 0 ? <span className="text-info">{t("new", { count: entry.rankedNew })}</span> : null}
                  {entry.rankedLost > 0 ? <span className="text-warning">{t("lost", { count: entry.rankedLost })}</span> : null}
                  {entry.aiAsked > 0 ? <span className="text-brand">{t("named", { named: entry.aiNamed, asked: entry.aiAsked })}</span> : null}
                  {entry.referringDomainsChange ? (
                    <span className={entry.referringDomainsChange > 0 ? "text-success" : "text-destructive"}>
                      {entry.referringDomainsChange > 0
                        ? t("linksGained", { count: entry.referringDomainsChange })
                        : t("linksLost", { count: -entry.referringDomainsChange })}
                    </span>
                  ) : null}
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
