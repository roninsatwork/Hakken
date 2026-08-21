"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ReactNode } from "react";
import { ArrowRight, LayoutDashboard, MailPlus, Users } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { cn } from "@/src/ui/lib/utils";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { useLocale, useTranslations } from "next-intl";

type EngagementPerson = {
  userId: Id<"users">;
  name: string;
  email: string;
  isAdmin: boolean;
  lastSeenAt?: number;
  signIns: number;
  questions: number;
  agentRuns: number;
};

type EngagementDay = {
  day: string;
  didNotSignIn: number;
  oneSession: number;
  twoSessions: number;
  threeSessions: number;
  fourSessions: number;
  fivePlusSessions: number;
  questions: number;
};

type Engagement = {
  daysBack: number;
  people: { total: number; active: number; quiet: number };
  questions: { asked: number; byPeople: number };
  signIns: { total: number; onDays: number };
  invitations: { pending: number; accepted: number; revoked: number };
  daily: EngagementDay[];
  everyone: EngagementPerson[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "3 days ago", not a timestamp. The gap is the point, not the date.
 * Returns a catalogue key (relative to `admin.companyDetails.dashboard`)
 * plus its parameters; the screen says the words.
 */
function describeLastSeen(lastSeenAt?: number) {
  if (!lastSeenAt) return { key: "lastSeen.never", params: undefined, stale: true };
  const days = Math.floor((Date.now() - lastSeenAt) / DAY_MS);
  if (days <= 0) return { key: "lastSeen.today", params: undefined, stale: false };
  if (days === 1) return { key: "lastSeen.yesterday", params: undefined, stale: false };
  return { key: "lastSeen.daysAgo", params: { days }, stale: days >= 14 };
}

/**
 * How often each person signed in, day by day.
 *
 * Every bar is the whole headcount: the people who signed in, banded by how
 * often, and the rest shown as not having signed in. Without that grey the one
 * active person in a team of eight looks like full adoption.
 *
 * The bands are an ordinal ramp — one hue, light to dark, in order — because
 * "four sessions" is more than "two", not a different kind of thing.
 * Categorical hues would say they were unrelated. The steps are validated
 * against this card's own surface.
 */
const SIGN_IN_BANDS = [
  { key: "didNotSignIn", labelKey: "bands.didNotSignIn", fill: "#4d4d52" },
  { key: "oneSession", labelKey: "bands.oneSession", fill: "#256abf" },
  { key: "twoSessions", labelKey: "bands.twoSessions", fill: "#3987e5" },
  { key: "threeSessions", labelKey: "bands.threeSessions", fill: "#6da7ec" },
  { key: "fourSessions", labelKey: "bands.fourSessions", fill: "#9ec5f4" },
  { key: "fivePlusSessions", labelKey: "bands.fivePlusSessions", fill: "#cde2fb" },
] as const;

function formatDay(day: string, locale = "en-GB") {
  const date = new Date(`${day}T00:00:00Z`);
  return date.toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" });
}

function ChartCard({ title, description, children }: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1 rounded-[16px] border border-border-dim bg-card/40 p-6">
      <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
      <p className="text-[12px] leading-relaxed text-muted">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Named so identity is never colour alone. */
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
  const tBands = useTranslations("admin.overview.dashboard");
  const locale = useLocale();
  if (!active || !payload?.length) return null;
  const rows = SIGN_IN_BANDS
    .map((band) => ({
      band,
      value: payload.find((entry) => entry.dataKey === band.key)?.value ?? 0,
    }))
    .filter((row) => row.value > 0);

  return (
    <div className="rounded-[10px] border border-border-dim bg-card px-3 py-2 shadow-lg">
      <div className="text-[12px] font-medium text-foreground">{label ? formatDay(label, locale) : ""}</div>
      {rows.map((row) => (
        <div key={row.band.key} className="mt-1 flex items-center gap-2 text-[12px] text-secondary">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: row.band.fill }} />
          {tBands("charts.signInTooltipRow", { count: row.value, band: tBands(row.band.labelKey).toLowerCase() })}
        </div>
      ))}
    </div>
  );
}

function QuestionsTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
}) {
  const t = useTranslations("admin.companyDetails.dashboard");
  const locale = useLocale();
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value ?? 0;
  return (
    <div className="rounded-[10px] border border-border-dim bg-card px-3 py-2 shadow-lg">
      <div className="text-[12px] font-medium text-foreground">{label ? formatDay(label, locale) : ""}</div>
      <div className="mt-1 text-[12px] text-secondary">
        {t("charts.questionsTooltip", { count: value })}
      </div>
    </div>
  );
}

/**
 * A company's front page, about its people.
 *
 * What was here reported tokens, quota and provider spend under the heading
 * "Dashboard" — a billing view promising an account view. That moved to AI
 * Usage. This answers the question an account manager actually opens a company
 * to ask: who is using this, how often, and who has stopped.
 */
export default function CompanyDashboardPage() {
  const t = useTranslations("admin.companyDetails.dashboard");
  const tBands = useTranslations("admin.overview.dashboard");
  const locale = useLocale();
  const formatDayTick = (day: string) => formatDay(day, locale);
  const { platformName } = useSystemSettings();
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const engagement = useQuery(api.companyEngagement.getCompanyEngagement, { companyId }) as Engagement | undefined;

  const people = engagement?.people;
  const everyone = engagement?.everyone ?? [];
  const invitations = engagement?.invitations;

  const headline = !engagement
    ? t("headline.loading")
    : people!.total === 0
      ? t("headline.nobody")
      : people!.active === 0
        ? t("headline.noneActive", { total: people!.total, platformName, days: engagement.daysBack })
        : t("headline.active", { active: people!.active, total: people!.total, platformName, days: engagement.daysBack })
          + `${people!.quiet > 0 ? t("headline.andQuiet", { quiet: people!.quiet }) : ""}.`;

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        icon={<LayoutDashboard className="h-6 w-6 text-brand" />}
        title={t("header.title")}
        description={t("header.description", { platformName })}
      />

      {/* The answer in a sentence, before any number. The screen this replaces
          led with six counters and made the reader do the arithmetic. */}
      <p className="text-[15px] font-semibold text-foreground">{headline}</p>

      {engagement ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-[16px] border border-border-dim bg-card/40 p-5">
            <div className="text-[12px] font-medium text-secondary">{t("cards.questionsAsked")}</div>
            <div className="mt-1 text-[28px] font-semibold text-foreground">{engagement.questions.asked}</div>
            <div className="mt-1 text-[12px] text-muted">
              {t("cards.byPeople", { count: engagement.questions.byPeople })}
            </div>
          </div>
          <div className="rounded-[16px] border border-border-dim bg-card/40 p-5">
            <div className="text-[12px] font-medium text-secondary">{t("cards.signIns")}</div>
            <div className="mt-1 text-[28px] font-semibold text-foreground">{engagement.signIns.total}</div>
            {/* Ten sign-ins on one day is not ten days of use, so the days are
                what the number is judged against. */}
            <div className="mt-1 text-[12px] text-muted">
              {t("cards.acrossDays", { count: engagement.signIns.onDays })}
            </div>
          </div>
          <div className="rounded-[16px] border border-border-dim bg-card/40 p-5">
            <div className="text-[12px] font-medium text-secondary">{t("cards.goneQuiet")}</div>
            <div className={cn("mt-1 text-[28px] font-semibold", people!.quiet > 0 ? "text-[#f59e0b]" : "text-foreground")}>
              {people!.quiet}
            </div>
            <div className="mt-1 text-[12px] text-muted">{t("cards.nothingRecorded", { days: engagement.daysBack })}</div>
          </div>
        </div>
      ) : null}

      {engagement ? (
        <ChartCard
          title={t("charts.signInsTitle")}
          description={t("charts.signInsDescription", { days: engagement.daysBack })}
        >
          {/* A numeric height, not a percentage: Recharts measures its parent,
              and a percentage of an unresolved height renders nothing on first
              paint. `quality-drift` guards this across every dashboard. */}
          <div className="w-full">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={engagement.daily} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                {/* Recessive: the data is the subject, the grid is scaffolding. */}
                <CartesianGrid stroke="var(--color-border-dim)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={formatDayTick}
                  tick={{ fontSize: 11, fill: "var(--color-muted)" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={16}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "var(--color-muted)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<SignInTooltip />} />
                {SIGN_IN_BANDS.map((band, index) => (
                  <Bar
                    key={band.key}
                    dataKey={band.key}
                    stackId="signIns"
                    fill={band.fill}
                    // A 2px surface gap between segments, and the top of the
                    // stack rounded rather than every segment.
                    stroke="var(--color-card)"
                    strokeWidth={2}
                    radius={index === SIGN_IN_BANDS.length - 1 ? [4, 4, 0, 0] : undefined}
                    // A dashboard should be readable the instant it is open, not
                    // after a bar race. It also means the chart draws the same
                    // whether or not the tab was in front when it loaded.
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ChartLegend items={SIGN_IN_BANDS.map((band) => ({ label: tBands(band.labelKey), fill: band.fill }))} />
        </ChartCard>
      ) : null}

      {engagement ? (
        <ChartCard
          title={t("charts.askingTitle")}
          description={t("charts.askingDescription", { platformName, days: engagement.daysBack })}
        >
          <div className="w-full">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={engagement.daily} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="var(--color-border-dim)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={formatDayTick}
                  tick={{ fontSize: 11, fill: "var(--color-muted)" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={16}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "var(--color-muted)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<QuestionsTooltip />} />
                {/* One series, so no legend: the title names it. A day with
                    nothing asked is drawn in the recessive grey rather than
                    left blank, so the gap is visible as a gap. */}
                <Bar dataKey="questions" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {engagement.daily.map((entry) => (
                    <Cell key={entry.day} fill={entry.questions > 0 ? "#3987e5" : "#4d4d52"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-foreground">{t("people.title")}</h2>

        <DataTable
          rows={engagement === undefined ? undefined : everyone}
          rowKey={(person) => person.userId}
          minWidthClassName="min-w-[820px]"
          empty={{
            icon: <Users className="h-8 w-8 text-muted/30" />,
            label: t("people.empty"),
            action: (
              <Link
                href={`/admin/companies/${companyId}/directory/invites`}
                className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline"
              >
                {t("people.invite")}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ),
          }}
          footer={{
            mode: "paged",
            page: 1,
            totalPages: 1,
            totalCount: everyone.length,
            pageSize: Math.max(everyone.length, 1),
            isLoading: engagement === undefined,
            onPageChange: () => {},
            labels: {
              empty: t("people.empty"),
              showing: (_start, _end, total) => t("people.showing", { count: total }),
            },
          }}
          columns={[
            {
              key: "person",
              header: t("people.columnPerson"),
              cell: (person) => (
                <>
                  <div className="text-[13px] font-medium text-foreground">
                    {person.name}
                    {person.isAdmin ? <span className="ml-2 text-[12px] text-muted">{t("people.admin")}</span> : null}
                  </div>
                  <div className="text-[12px] text-muted">{person.email}</div>
                </>
              ),
            },
            {
              key: "lastSeen",
              header: t("people.columnLastSeen"),
              /* Least recently seen sorts to the top, so the people worth a call
                 are the first thing read. */
              cell: (person) => {
                const lastSeen = describeLastSeen(person.lastSeenAt);
                return (
                  <span className={cn("text-[13px]", lastSeen.stale ? "text-[#f59e0b]" : "text-secondary")}>
                    {t(lastSeen.key, lastSeen.params)}
                  </span>
                );
              },
            },
            {
              key: "signIns",
              header: t("people.columnSignIns"),
              cell: (person) => <span className="text-[13px] text-secondary">{person.signIns}</span>,
            },
            {
              key: "questions",
              header: t("people.columnQuestions"),
              cell: (person) => <span className="text-[13px] text-secondary">{person.questions}</span>,
            },
            {
              key: "agentRuns",
              header: t("people.columnAgentRuns"),
              cell: (person) => <span className="text-[13px] text-secondary">{person.agentRuns}</span>,
            },
          ]}
        />
      </section>

      {/* Only when somebody has been invited and has not arrived. A permanent
          panel of invitation counts is a wall of zeros on a settled account. */}
      {invitations && invitations.pending > 0 ? (
        <Link
          href={`/admin/companies/${companyId}/directory/invites`}
          className="flex items-start gap-3 rounded-[10px] border border-border-dim bg-card px-4 py-3 transition-colors hover:border-brand/40"
        >
          <MailPlus className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#f59e0b]" />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-foreground">
              {t("invites.title", { count: invitations.pending })}
            </div>
            <div className="mt-0.5 text-[13px] text-secondary">
              {t("invites.sub", { platformName })}
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] text-brand">
            {t("invites.cta")}
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>
      ) : null}

      {/* Kept deliberately. A screen that measures people has to say who it
          cannot see, or the numbers get read as the whole truth. */}
      {engagement ? (
        <div className="rounded-[10px] border border-border-dim bg-card/30 px-4 py-3">
          <div className="text-[12px] font-medium text-secondary">{t("notCovered.title")}</div>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-[12px] leading-relaxed text-muted">
            <li>{t("notCovered.item1")}</li>
            <li>{t("notCovered.item2")}</li>
            <li>{t("notCovered.item3")}</li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
