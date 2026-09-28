"use client";

import { useTranslations } from "next-intl";
import { SiteFigure } from "../../sites/_components/SiteFigure";
import { formatNumber } from "../../sites/_components/siteFormat";
import { formatPosition, formatRate } from "./searchConsoleFormat";

type Figures = { clicks: number; impressions: number; ctr: number; position: number };

/**
 * The four headline figures of a website, a search or a page — clicks,
 * impressions, click-through rate and Google's average position — each
 * against the same number of days before when those days are held, the
 * arrow carrying the meaning and colour only repeating it.
 */
export function SearchConsoleFigures({ totals, previous, days, isNew = false }: {
  totals: Figures | null;
  previous: Figures | null;
  days: number;
  /** A search or page Google did not show at all in the days before. */
  isNew?: boolean;
}) {
  const t = useTranslations("searchConsole.figures");
  const tone = (change: number) => (change > 0 ? "text-success" : change < 0 ? "text-destructive" : "text-muted");
  const against = (now: number, before: number | undefined, write: (change: number) => string) => {
    if (isNew) return <span className="text-success">{t("new")}</span>;
    if (before === undefined) return <span className="text-muted">{t("noBefore")}</span>;
    const change = now - before;
    if (Math.abs(change) < 1e-9) return <span className="text-muted">{t("same", { days })}</span>;
    return <span className={tone(change)}>{t(change > 0 ? "up" : "down", { change: write(Math.abs(change)), days })}</span>;
  };
  const growth = (now: number, before: number) => (change: number) => (before > 0 ? formatRate(change / before) : formatNumber(change));
  const positionChange = () => {
    if (isNew) return <span className="text-success">{t("new")}</span>;
    if (!previous || !totals) return <span className="text-muted">{t("positionNote")}</span>;
    // Lower is better: the change is how many places it rose.
    const change = previous.position - totals.position;
    if (Math.abs(change) < 0.05) return <span className="text-muted">{t("same", { days })} · {t("positionNote")}</span>;
    return (
      <span className={tone(change)}>
        {t(change > 0 ? "better" : "worse", { change: formatPosition(Math.abs(change)), days })} · {t("positionNote")}
      </span>
    );
  };
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SiteFigure
        label={t("clicks")}
        value={formatNumber(totals?.clicks ?? 0)}
        detail={against(totals?.clicks ?? 0, previous?.clicks, growth(totals?.clicks ?? 0, previous?.clicks ?? 0))}
      />
      <SiteFigure
        label={t("impressions")}
        value={formatNumber(totals?.impressions ?? 0)}
        detail={against(totals?.impressions ?? 0, previous?.impressions, growth(totals?.impressions ?? 0, previous?.impressions ?? 0))}
      />
      <SiteFigure
        label={t("ctr")}
        value={formatRate(totals?.ctr ?? null)}
        detail={against((totals?.ctr ?? 0) * 100, previous ? previous.ctr * 100 : undefined, (change) => t("points", { change: formatPosition(change) }))}
      />
      <SiteFigure label={t("position")} value={formatPosition(totals?.position ?? null)} detail={positionChange()} />
    </div>
  );
}
