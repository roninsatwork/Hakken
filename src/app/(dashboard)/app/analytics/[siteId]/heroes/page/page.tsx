"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { ArrowUpRight, Check, ListTodo, LogIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { Notice } from "@/src/ui/components/screens/Notice";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { formatDay, formatNumber } from "../../../../sites/_components/siteFormat";
import { AnalyticsGate } from "../../../_components/AnalyticsNotices";
import { formatMoney, formatPercent } from "../../../_components/analyticsFormat";
import { PageStages, formatRate, type PageJourney } from "../../../_components/PageStages";
import { HERO_TONES, worthWords } from "../../../_components/heroWords";
import { useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, type AnalyticsStatus } from "../../../_components/useAnalytics";
import type { HeroKind } from "@/convex/utils/heroes";

/**
 * One page of Heroes and attention (docs/plans/active/google-analytics-plan.md
 * §13, part 4): the way back, the same four stages for this page with the one
 * where it loses most marked, then What to do — each problem the page has,
 * why in one sentence with its own figures, what fixing it is worth a month,
 * and the rule that flagged it — and "Make it a Hakken task". Links go to the
 * page's own screen and to its searches in Search Console.
 */
export default function AnalyticsHeroPage() {
  const status = useAnalyticsStatus();
  const siteId = useAnalyticsSiteId();
  return status ? (
    <AnalyticsGate status={status} siteId={siteId}>
      <HeroPageBody status={status} />
    </AnalyticsGate>
  ) : null;
}

function HeroPageBody({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.heroes");
  const tp = useTranslations("googleAnalytics.heroes.page");
  const siteId = useAnalyticsSiteId();
  const hrefFor = useAnalyticsHref(siteId);
  const params = useSearchParams();
  const page = params.get("key") ?? "";
  const ref = params.get("ref");
  const consoleAddress = params.get("console");
  const answer = useQuery(api.googleAnalyticsHeroes.analyticsHeroPage, page ? { siteId, page, ...(ref ? { ref } : {}), ...(consoleAddress ? { console: consoleAddress } : {}) } : "skip");
  const found = answer?.found ?? null;
  const currency = answer?.currency ?? status.connection?.currency ?? null;
  const kinds: HeroKind[] = found ? [...found.problems.map((problem) => problem.kind), ...(found.hero ? ["hero" as const] : [])] : [];
  const main = kinds[0] ?? null;
  const taskHref = found && main ? `/app/assistant?ask=${encodeURIComponent(t(`taskAsk.${main}`, { page: found.page, host: status.host }))}` : null;

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={{ label: tp("back"), href: hrefFor("heroes") }}
        icon={<LogIn className="h-5 w-5 text-brand" />}
        title={found?.page ?? page ?? "…"}
        description={tp("description", { host: status.host })}
        pills={kinds.length > 0 ? (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {kinds.map((kind) => <StatusLabel key={kind} tone={HERO_TONES[kind]}>{t(`kinds.${kind}`)}</StatusLabel>)}
          </span>
        ) : undefined}
        action={found ? (
          <div className="flex flex-wrap items-center gap-4">
            <a href={found.address.startsWith("http") ? found.address : `https://${status.host}${found.page}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[12px] text-secondary hover:text-foreground">
              {tp("openPage")}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            {found.task ? (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-success">
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                {t("taskMade")}
              </span>
            ) : taskHref ? (
              <Link href={taskHref} className="inline-flex items-center gap-1.5 text-[12px] text-secondary hover:text-foreground">
                <ListTodo className="h-3.5 w-3.5" aria-hidden="true" />
                {t("taskMake")}
              </Link>
            ) : null}
          </div>
        ) : undefined}
      />

      {answer?.analyticsTo ? (
        <p className="text-[12px] text-muted">
          {answer.consoleTo
            ? t("figuresTo", { console: formatDay(answer.consoleTo), analytics: formatDay(answer.analyticsTo) })
            : t("figuresToAnalytics", { analytics: formatDay(answer.analyticsTo) })}
        </p>
      ) : null}

      {answer === undefined ? (
        <div className="h-24 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />
      ) : !found ? (
        <Notice>{answer.state === "PREPARING" ? t("preparing") : tp("notFound")}</Notice>
      ) : (
        <>
          <PageStages journey={found} currency={currency} consoleConnected={answer.consoleConnected} />

          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-[14px] font-medium text-foreground">{tp("todoTitle")}</h2>
              <p className="text-[12px] text-secondary">{kinds.length > 0 ? tp("todoDescription") : tp("nothingToDo")}</p>
            </div>
            {kinds.map((kind) => (
              <ToDo key={kind} kind={kind} journey={found} currency={currency} />
            ))}
          </section>

          <div className="flex flex-wrap items-center gap-6">
            {found.landingKey ? (
              <Link href={hrefFor("landing-pages/page", { key: found.landingKey })} className="inline-flex items-center gap-1.5 text-[12px] text-secondary hover:text-foreground">
                {tp("allFigures")}
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            ) : null}
            {found.consoleAddress ? (
              <Link href={`/app/search-console/${siteId}/pages/page?key=${encodeURIComponent(found.consoleAddress)}`} className="inline-flex items-center gap-1.5 text-[12px] text-secondary hover:text-foreground">
                {tp("itsSearches")}
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

/** One problem: its label and worth, why in one sentence with the page's own figures, and the rule that flagged it. */
function ToDo({ kind, journey, currency }: { kind: HeroKind; journey: PageJourney; currency: string | null }) {
  const t = useTranslations("googleAnalytics.heroes");
  const tp = useTranslations("googleAnalytics.heroes.page");
  const problem = journey.problems.find((one) => one.kind === kind) ?? null;
  const google = journey.google;
  const visits = journey.visits;
  const why = (() => {
    switch (kind) {
      case "push":
        return tp("why.push", { shown: formatNumber(google?.shown ?? 0), position: (google?.position ?? 0).toFixed(1), gain: formatNumber(problem?.gain ?? 0) });
      case "click":
        return tp("why.click", { clicks: formatNumber(google?.clicks ?? 0), shown: formatNumber(google?.shown ?? 0), position: (google?.position ?? 0).toFixed(1), expected: formatNumber(problem?.expected ?? 0) });
      case "convert":
        return tp("why.convert", { visits: formatNumber(visits?.visits ?? 0), conversions: visits?.conversions ?? 0 });
      case "leave":
        return tp("why.leave", { rate: formatPercent(visits && visits.visits > 0 ? visits.engaged / visits.visits : null), visits: formatNumber(visits?.visits ?? 0) });
      case "fall":
        return tp("why.fall", { before: formatNumber(journey.visitsBefore?.visits ?? 0), visits: formatNumber(visits?.visits ?? 0) });
      case "hero":
        return tp("why.hero", { money: formatMoney(visits?.value ?? 0, currency), total: formatMoney(journey.website.value, currency) });
    }
  })();
  return (
    <div className="flex flex-col gap-1.5 border-t border-border-dim pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusLabel tone={HERO_TONES[kind]}>{t(`kinds.${kind}`)}</StatusLabel>
        {problem ? (
          <span className="font-mono text-[12px] text-foreground">
            {problem.worth === null
              ? tp("notPriced")
              : problem.worth < 100
                ? tp("worthUnder", { money: formatMoney(100, currency) })
                : tp("worth", { money: worthWords(problem.worth, currency, t) })}
          </span>
        ) : null}
      </div>
      <p className="max-w-[75ch] text-[13px] leading-[1.6] text-secondary">{why}</p>
      <p className="text-[12px] text-muted">{tp("rule", { rule: tp(`rules.${kind}`, { rate: formatRate(journey.website.conversionRate) }) })}</p>
    </div>
  );
}
