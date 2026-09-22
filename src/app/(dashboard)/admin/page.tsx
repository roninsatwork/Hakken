"use client";

import type { ReactNode } from "react";
import {
  CHART_COMPARATOR_GREY,
  CHART_ENGAGEMENT_NONE,
  CHART_ENGAGEMENT_RAMP,
  CHART_PRIMARY_BLUE,
} from "@/src/ui/components/charts/chartPalette";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AlertTriangle, ArrowRight, CircleCheck, LayoutDashboard, MailPlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { cn } from "@/src/ui/lib/utils";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { CHART_CURSOR, ChartTooltipSurface } from "@/src/ui/components/charts/ChartTooltip";

const Area = dynamic(() => import("recharts").then((module) => module.Area));
const AreaChart = dynamic(() => import("recharts").then((module) => module.AreaChart));
const Bar = dynamic(() => import("recharts").then((module) => module.Bar));
const BarChart = dynamic(() => import("recharts").then((module) => module.BarChart));
const CartesianGrid = dynamic(() => import("recharts").then((module) => module.CartesianGrid));
const Line = dynamic(() => import("recharts").then((module) => module.Line));
const LineChart = dynamic(() => import("recharts").then((module) => module.LineChart));
const ResponsiveContainer = dynamic(() => import("recharts").then((module) => module.ResponsiveContainer));
const Tooltip = dynamic(() => import("recharts").then((module) => module.Tooltip));
const XAxis = dynamic(() => import("recharts").then((module) => module.XAxis));
const YAxis = dynamic(() => import("recharts").then((module) => module.YAxis));
const PlanDistributionChart = dynamic(() =>
  import("./_components/PlanDistributionChart").then((module) => module.PlanDistributionChart)
);

type ClientState = "HEALTHY" | "NEEDS_ATTENTION" | "UNUSED";

type PortfolioRow = {
  companyId: Id<"companies">;
  name: string;
  planName?: string;
  mrrGBP: number;
  people: number;
  activeRecently: number;
  quiet: number;
  state: ClientState;
};

type PlatformOverview = {
  windowDays: number;
  coverage: { complete: boolean; incomplete: string[] };
  clients: { total: number; healthy: number; needsAttention: number; unused: number };
  money: { projectedMrrGBP: number; aiSpendUsd: number; spendAsPercentOfRevenue: number | null };
  seats: { total: number; active: number; utilisation: number };
  todo: { pendingInvitations: number; companiesWithNoPlan: number };
  planDistribution: Array<{ name: string; companies: number }>;
  daily: Array<{ day: string; questions: number; aiCalls: number; spendUsd: number }>;
  signInBands: Array<{
    day: string;
    didNotSignIn: number;
    oneSession: number;
    twoSessions: number;
    threeSessions: number;
    fourSessions: number;
    fivePlusSessions: number;
  }>;
  portfolio: PortfolioRow[];
};

/**
 * The sign-in bands: an ordinal ramp, one hue light to dark, in order.
 *
 * "Four sessions" is more than "two", not a different kind of thing, so
 * categorical hues would misdescribe it. The steps are validated against this
 * card's own surface rather than eyeballed, and the neutral is the people who
 * did not sign in — without whom one active person looks like full adoption.
 */
const SIGN_IN_BANDS = [
  { key: "didNotSignIn", labelKey: "bands.didNotSignIn", fill: CHART_ENGAGEMENT_NONE },
  { key: "oneSession", labelKey: "bands.oneSession", fill: CHART_ENGAGEMENT_RAMP[0] },
  { key: "twoSessions", labelKey: "bands.twoSessions", fill: CHART_ENGAGEMENT_RAMP[1] },
  { key: "threeSessions", labelKey: "bands.threeSessions", fill: CHART_ENGAGEMENT_RAMP[2] },
  { key: "fourSessions", labelKey: "bands.fourSessions", fill: CHART_ENGAGEMENT_RAMP[3] },
  { key: "fivePlusSessions", labelKey: "bands.fivePlusSessions", fill: CHART_ENGAGEMENT_RAMP[4] },
] as const;

/** Two unrelated series, so two categorical slots rather than one ramp. */
const ACTIVITY_SERIES = [
  { key: "questions", labelKey: "series.questions", stroke: CHART_PRIMARY_BLUE },
  { key: "aiCalls", labelKey: "series.aiCalls", stroke: CHART_COMPARATOR_GREY },
] as const;

const STATE_LABEL_KEYS: Record<ClientState, string> = {
  HEALTHY: "state.healthy",
  NEEDS_ATTENTION: "state.needsAttention",
  UNUSED: "state.unused",
};

const STATE_CLASSES: Record<ClientState, string> = {
  HEALTHY: "text-[#10b981]",
  NEEDS_ATTENTION: "text-[#f59e0b]",
  UNUSED: "text-muted",
};

const AXIS_TICK = { fontSize: 11, fill: "var(--color-muted)" } as const;

function formatDay(day: string, locale = "en-GB") {
  return new Date(`${day}T00:00:00Z`)
    .toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * Two currencies meet on this screen, and only this screen.
 *
 * Plan prices are set in pounds (`plans.priceGBP`) and are genuinely pounds.
 * Model spend is the provider's own published dollar price and nothing converts
 * it. They used to agree only because spend was multiplied by a hardcoded 0.78
 * on the way here — a guessed rate, in front of a figure the rest of the product
 * already showed in dollars.
 *
 * So each number now carries the sign it is actually denominated in. The
 * percentage beside them is the one thing that cannot be made honest without a
 * real exchange rate; it is flagged rather than quietly restated.
 */
function formatRevenue(value: number) {
  return `£${value.toFixed(2)}`;
}

function formatSpend(value: number) {
  return `$${value.toFixed(2)}`;
}

function ChartCard({ title, description, action, children }: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1 rounded-[16px] border border-border-dim bg-card/40 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{description}</p>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ChartLegend({ items }: { items: ReadonlyArray<{ label: string; fill: string }> }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 text-[12px] text-secondary">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: item.fill }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function SignInTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number }>;
  label?: string;
}) {
  const t = useTranslations("admin.overview.dashboard");
  const locale = useLocale();
  if (!active || !payload?.length) return null;
  const rows = SIGN_IN_BANDS
    .map((band) => ({ band, value: payload.find((entry) => entry.dataKey === band.key)?.value ?? 0 }))
    .filter((row) => row.value > 0);
  return (
    <ChartTooltipSurface heading={label ? formatDay(label, locale) : ""}>
      {rows.map((row) => (
        <div key={row.band.key} className="flex items-center gap-2 text-[12px] text-secondary">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: row.band.fill }} />
          {t("charts.signInTooltipRow", { count: row.value, band: t(row.band.labelKey).toLowerCase() })}
        </div>
      ))}
    </ChartTooltipSurface>
  );
}

function ActivityTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number }>;
  label?: string;
}) {
  const t = useTranslations("admin.overview.dashboard");
  const locale = useLocale();
  if (!active || !payload?.length) return null;
  return (
    <ChartTooltipSurface heading={label ? formatDay(label, locale) : ""}>
      {ACTIVITY_SERIES.map((series) => (
        <div key={series.key} className="flex items-center gap-2 text-[12px] text-secondary">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: series.stroke }} />
          {payload.find((entry) => entry.dataKey === series.key)?.value ?? 0} · {t(series.labelKey).toLowerCase()}
        </div>
      ))}
    </ChartTooltipSurface>
  );
}

function SpendTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
}) {
  const t = useTranslations("admin.overview.dashboard");
  const locale = useLocale();
  if (!active || !payload?.length) return null;
  return (
    <ChartTooltipSurface heading={label ? formatDay(label, locale) : ""}>
      <div className="text-[12px] text-secondary">{t("charts.spentTooltip", { amount: formatSpend(payload[0]?.value ?? 0) })}</div>
    </ChartTooltipSurface>
  );
}

/**
 * How the business is doing, and which client needs attention today.
 *
 * What was here reported tokens, model mix and provider mix — the same view the
 * per-company AI Usage screen gives, aggregated, and an answer to neither
 * question a platform owner opens the front page to ask. Its headline figures
 * were also wrong: they came from a counter only ever incremented on create, so
 * it read nought companies while companies plainly existed.
 */
export default function AdminDashboardPage() {
  const t = useTranslations("admin.overview.dashboard");
  const locale = useLocale();
  const formatDayTick = (day: string) => formatDay(day, locale);
  const { platformName } = useSystemSettings();
  const overview = useQuery(api.platformOverview.getPlatformOverview, {}) as PlatformOverview | undefined;

  const clients = overview?.clients;
  const portfolio = overview?.portfolio ?? [];
  const needsAction = (overview?.todo.pendingInvitations ?? 0) + (overview?.todo.companiesWithNoPlan ?? 0);
  const allWell = clients !== undefined && clients.needsAttention === 0 && clients.unused === 0;

  const headline = !overview
    ? t("headline.loading")
    : clients!.total === 0
      ? t("headline.noClients")
      : allWell
        ? t("headline.allHealthy", { count: clients!.total })
        : [
          t("headline.healthyOf", { healthy: clients!.healthy, total: clients!.total }),
          clients!.needsAttention > 0 ? t("headline.needAttention", { count: clients!.needsAttention }) : null,
          clients!.unused > 0 ? t("headline.nobodyAdded", { count: clients!.unused }) : null,
        ].filter(Boolean).join(" · ") + ".";

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        divider
        icon={<LayoutDashboard className="h-6 w-6 text-brand" />}
        title={t("header.title")}
        description={t("header.description")}
      />

      {overview ? (
        <div
          className={cn(
            "flex items-center gap-3 rounded-[10px] border px-4 py-3",
            allWell ? "border-[#10b981]/20 bg-[#10b981]/10" : "border-[#f59e0b]/20 bg-[#f59e0b]/10",
          )}
        >
          {allWell
            ? <CircleCheck className="h-[18px] w-[18px] shrink-0 text-[#10b981]" />
            : <AlertTriangle className="h-[18px] w-[18px] shrink-0 text-[#f59e0b]" />}
          <span className={cn("text-[15px] font-semibold", allWell ? "text-[#10b981]" : "text-[#f59e0b]")}>
            {headline}
          </span>
        </div>
      ) : null}

      {/* A month too busy to read in one pass used to look like a quiet one.
          The figures still show — they are directionally true and refusing the
          screen helps nobody — but they no longer claim to be exact. */}
      {overview && !overview.coverage.complete ? (
        <div className="flex items-start gap-3 rounded-[10px] border border-border-dim bg-card/40 px-4 py-3">
          <AlertTriangle className="mt-[2px] h-[18px] w-[18px] shrink-0 text-secondary" />
          <div>
            <div className="text-[13px] font-semibold text-foreground">{t("coverage.title")}</div>
            <div className="mt-1 text-[12px] text-secondary">
              {t("coverage.body", { windowDays: overview.windowDays })}
            </div>
          </div>
        </div>
      ) : null}

      {overview ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Revenue against what it costs to serve. A bare revenue figure hides
              the margin, which is the number that decides whether this works. */}
          <div className="rounded-[16px] border border-border-dim bg-card/40 p-5">
            <div className="text-[12px] font-medium text-secondary">{t("cards.revenueTitle")}</div>
            <div className="mt-1 text-[28px] font-semibold text-foreground">
              {formatRevenue(overview.money.projectedMrrGBP)}
            </div>
            <div className="mt-1 text-[12px] text-muted">
              {overview.money.spendAsPercentOfRevenue === null
                ? t("cards.spendNoPlans", { spend: formatSpend(overview.money.aiSpendUsd) })
                : t("cards.spendPercent", { spend: formatSpend(overview.money.aiSpendUsd), percent: overview.money.spendAsPercentOfRevenue })}
            </div>
          </div>
          <div className="rounded-[16px] border border-border-dim bg-card/40 p-5">
            <div className="text-[12px] font-medium text-secondary">{t("cards.seatsTitle")}</div>
            <div className="mt-1 text-[28px] font-semibold text-foreground">
              {overview.seats.active} <span className="text-[16px] font-normal text-muted">{t("cards.seatsOf", { total: overview.seats.total })}</span>
            </div>
            <div className="mt-1 text-[12px] text-muted">
              {t("cards.seatsUsed", { utilisation: overview.seats.utilisation, days: overview.windowDays })}
            </div>
          </div>
          <div className="rounded-[16px] border border-border-dim bg-card/40 p-5">
            <div className="text-[12px] font-medium text-secondary">{t("cards.attentionTitle")}</div>
            <div className={cn(
              "mt-1 text-[28px] font-semibold",
              clients!.needsAttention > 0 ? "text-[#f59e0b]" : "text-foreground",
            )}>
              {clients!.needsAttention}
            </div>
            <div className="mt-1 text-[12px] text-muted">{t("cards.attentionSub", { platformName })}</div>
          </div>
        </div>
      ) : null}

      {overview ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard
            title={t("charts.activityTitle")}
            description={t("charts.activityDescription", { days: overview.windowDays })}
          >
            <div className="w-full">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={overview.daily} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="var(--color-border-dim)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tickFormatter={formatDayTick} tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                  <Tooltip content={<ActivityTooltip />} />
                  {ACTIVITY_SERIES.map((series) => (
                    <Line
                      key={series.key}
                      type="monotone"
                      dataKey={series.key}
                      stroke={series.stroke}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            {/* The gap between the lines is automation running unasked. */}
            <ChartLegend items={ACTIVITY_SERIES.map((series) => ({ label: t(series.labelKey), fill: series.stroke }))} />
          </ChartCard>

          <ChartCard
            title={t("charts.spendTitle")}
            description={t("charts.spendDescription", { days: overview.windowDays })}
          >
            <div className="w-full">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={overview.daily} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
                  <defs>
                    <linearGradient id="platform-spend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_PRIMARY_BLUE} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={CHART_PRIMARY_BLUE} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-border-dim)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tickFormatter={formatDayTick} tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(value: number) => `$${value.toFixed(2)}`} />
                  <Tooltip content={<SpendTooltip />} />
                  {/* One series, so the title names it and no legend is needed. */}
                  <Area
                    type="monotone"
                    dataKey="spendUsd"
                    stroke={CHART_PRIMARY_BLUE}
                    strokeWidth={2}
                    fill="url(#platform-spend)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      ) : null}

      {overview ? (
        <ChartCard
          title={t("charts.signInsTitle")}
          description={t("charts.signInsDescription", { days: overview.windowDays })}
        >
          <div className="w-full">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={overview.signInBands} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="var(--color-border-dim)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tickFormatter={formatDayTick} tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <Tooltip cursor={CHART_CURSOR} content={<SignInTooltip />} />
                {SIGN_IN_BANDS.map((band, index) => (
                  <Bar
                    key={band.key}
                    dataKey={band.key}
                    stackId="signIns"
                    fill={band.fill}
                    stroke="var(--color-card)"
                    strokeWidth={2}
                    radius={index === SIGN_IN_BANDS.length - 1 ? [4, 4, 0, 0] : undefined}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ChartLegend items={SIGN_IN_BANDS.map((band) => ({ label: t(band.labelKey), fill: band.fill }))} />
        </ChartCard>
      ) : null}

      {overview && overview.planDistribution.length > 0 ? (
        <ChartCard
          title={t("charts.plansTitle")}
          description={t("charts.plansDescription")}
          action={
            <Link href="/admin/settings/plans" className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-brand hover:underline">
              {t("charts.managePlans")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          <PlanDistributionChart
            data={overview.planDistribution}
            noPlanName="No plan"
            noPlanFill={CHART_ENGAGEMENT_NONE}
            planFill={CHART_PRIMARY_BLUE}
            unitLabel={(count) => t("charts.plansTooltipUnit", { count })}
          />
        </ChartCard>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-foreground">{t("clients.title")}</h2>

        <DataTable
          rows={overview === undefined ? undefined : portfolio}
          rowKey={(client) => client.companyId}
          minWidthClassName="min-w-[900px]"
          empty={{ icon: <LayoutDashboard className="h-8 w-8 text-muted/30" />, label: t("clients.empty") }}
          footer={{
            mode: "paged",
            page: 1,
            totalPages: 1,
            totalCount: portfolio.length,
            pageSize: Math.max(portfolio.length, 1),
            isLoading: overview === undefined,
            onPageChange: () => {},
            labels: {
              empty: t("clients.empty"),
              showing: (_start, _end, total) => t("clients.showing", { count: total }),
            },
          }}
          columns={[
            {
              key: "client",
              header: t("clients.columnClient"),
              cell: (client) => (
                <>
                  <div className="text-[13px] font-medium text-foreground">{client.name}</div>
                  <div className="text-[12px] text-muted">{client.planName ?? t("clients.noPlan")}</div>
                </>
              ),
            },
            {
              key: "state",
              header: t("clients.columnState"),
              cell: (client) => (
                <span className={cn("text-[13px]", STATE_CLASSES[client.state])}>
                  {t(STATE_LABEL_KEYS[client.state])}
                </span>
              ),
            },
            {
              key: "active",
              header: t("clients.columnActive"),
              cell: (client) => (
                <span className="text-[13px] text-secondary">
                  {t("clients.activeOf", { active: client.activeRecently, people: client.people })}
                </span>
              ),
            },
            {
              key: "quiet",
              header: t("clients.columnQuiet"),
              cell: (client) => <span className="text-[13px] text-secondary">{client.quiet}</span>,
            },
            {
              key: "revenue",
              header: t("clients.columnRevenue"),
              cell: (client) => (
                <span className="text-[13px] text-secondary">{formatRevenue(client.mrrGBP)}</span>
              ),
            },
            {
              key: "open",
              header: "",
              align: "right",
              cell: (client) => (
                <Link
                  href={`/admin/companies/${client.companyId}`}
                  className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline"
                >
                  {t("clients.open")}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ),
            },
          ]}
        />
      </section>

      {/* Only when there is something to do. A permanent panel of zeroes is the
          fault this whole pass has been removing. */}
      {overview && needsAction > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold text-foreground">{t("todo.title")}</h2>
          {overview.todo.pendingInvitations > 0 ? (
            <Link
              href="/admin/users/invite"
              className="flex items-start gap-3 rounded-[10px] border border-border-dim bg-card px-4 py-3 transition-colors hover:border-brand/40"
            >
              <MailPlus className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#f59e0b]" />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-foreground">
                  {t("todo.invitesTitle", { count: overview.todo.pendingInvitations })}
                </div>
                <div className="mt-0.5 text-[13px] text-secondary">{t("todo.invitesSub", { platformName })}</div>
              </div>
              <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] text-brand">
                {t("todo.invitesCta")}
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          ) : null}
          {overview.todo.companiesWithNoPlan > 0 ? (
            <Link
              href="/admin/companies"
              className="flex items-start gap-3 rounded-[10px] border border-border-dim bg-card px-4 py-3 transition-colors hover:border-brand/40"
            >
              <AlertTriangle className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#f59e0b]" />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-foreground">
                  {t("todo.noPlanTitle", { count: overview.todo.companiesWithNoPlan })}
                </div>
                <div className="mt-0.5 text-[13px] text-secondary">{t("todo.noPlanSub")}</div>
              </div>
              <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] text-brand">
                {t("todo.noPlanCta")}
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
