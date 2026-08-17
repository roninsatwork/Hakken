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
import {
  TableEmptyRow,
  TableHeaderCell,
  TableHeaderRow,
  TableLoadingRow,
  TableShell,
} from "@/src/ui/components/screens/Table";
import { cn } from "@/src/ui/lib/utils";

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

/** "3 days ago", not a timestamp. The gap is the point, not the date. */
function describeLastSeen(lastSeenAt?: number) {
  if (!lastSeenAt) return { label: "Never", stale: true };
  const days = Math.floor((Date.now() - lastSeenAt) / DAY_MS);
  if (days <= 0) return { label: "Today", stale: false };
  if (days === 1) return { label: "Yesterday", stale: false };
  return { label: `${days} days ago`, stale: days >= 14 };
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
  { key: "didNotSignIn", label: "Did not sign in", fill: "#4d4d52" },
  { key: "oneSession", label: "1 session", fill: "#256abf" },
  { key: "twoSessions", label: "2 sessions", fill: "#3987e5" },
  { key: "threeSessions", label: "3 sessions", fill: "#6da7ec" },
  { key: "fourSessions", label: "4 sessions", fill: "#9ec5f4" },
  { key: "fivePlusSessions", label: "5+ sessions", fill: "#cde2fb" },
] as const;

function formatDay(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
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
  if (!active || !payload?.length) return null;
  const rows = SIGN_IN_BANDS
    .map((band) => ({
      band,
      value: payload.find((entry) => entry.dataKey === band.key)?.value ?? 0,
    }))
    .filter((row) => row.value > 0);

  return (
    <div className="rounded-[10px] border border-border-dim bg-card px-3 py-2 shadow-lg">
      <div className="text-[12px] font-medium text-foreground">{label ? formatDay(label) : ""}</div>
      {rows.map((row) => (
        <div key={row.band.key} className="mt-1 flex items-center gap-2 text-[12px] text-secondary">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: row.band.fill }} />
          {row.value} {row.value === 1 ? "person" : "people"} · {row.band.label.toLowerCase()}
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
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value ?? 0;
  return (
    <div className="rounded-[10px] border border-border-dim bg-card px-3 py-2 shadow-lg">
      <div className="text-[12px] font-medium text-foreground">{label ? formatDay(label) : ""}</div>
      <div className="mt-1 text-[12px] text-secondary">
        {value} {value === 1 ? "question" : "questions"} asked
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
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const engagement = useQuery(api.companyEngagement.getCompanyEngagement, { companyId }) as Engagement | undefined;

  const people = engagement?.people;
  const everyone = engagement?.everyone ?? [];
  const invitations = engagement?.invitations;

  const headline = !engagement
    ? "Counting what this company's people have been doing."
    : people!.total === 0
      ? "Nobody has been added to this company yet."
      : people!.active === 0
        ? `None of the ${people!.total} people here have used Sonae in the last ${engagement.daysBack} days.`
        : `${people!.active} of ${people!.total} people used Sonae in the last ${engagement.daysBack} days`
          + `${people!.quiet > 0 ? `, and ${people!.quiet} did not` : ""}.`;

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        icon={<LayoutDashboard className="h-6 w-6 text-brand" />}
        title="Dashboard"
        description="Who is using Sonae here, how often, and who has gone quiet."
      />

      {/* The answer in a sentence, before any number. The screen this replaces
          led with six counters and made the reader do the arithmetic. */}
      <p className="text-[15px] font-semibold text-foreground">{headline}</p>

      {engagement ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-[16px] border border-border-dim bg-card/40 p-5">
            <div className="text-[12px] font-medium text-secondary">Questions asked</div>
            <div className="mt-1 text-[28px] font-semibold text-foreground">{engagement.questions.asked}</div>
            <div className="mt-1 text-[12px] text-muted">
              by {engagement.questions.byPeople} {engagement.questions.byPeople === 1 ? "person" : "people"}
            </div>
          </div>
          <div className="rounded-[16px] border border-border-dim bg-card/40 p-5">
            <div className="text-[12px] font-medium text-secondary">Sign-ins</div>
            <div className="mt-1 text-[28px] font-semibold text-foreground">{engagement.signIns.total}</div>
            {/* Ten sign-ins on one day is not ten days of use, so the days are
                what the number is judged against. */}
            <div className="mt-1 text-[12px] text-muted">
              across {engagement.signIns.onDays} {engagement.signIns.onDays === 1 ? "day" : "days"}
            </div>
          </div>
          <div className="rounded-[16px] border border-border-dim bg-card/40 p-5">
            <div className="text-[12px] font-medium text-secondary">Gone quiet</div>
            <div className={cn("mt-1 text-[28px] font-semibold", people!.quiet > 0 ? "text-[#f59e0b]" : "text-foreground")}>
              {people!.quiet}
            </div>
            <div className="mt-1 text-[12px] text-muted">nothing recorded in {engagement.daysBack} days</div>
          </div>
        </div>
      ) : null}

      {engagement ? (
        <ChartCard
          title="How often people sign in"
          description={`Each bar is everyone here, banded by how many times they signed in that day. Last ${engagement.daysBack} days, people who run the platform excluded.`}
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
                  tickFormatter={formatDay}
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
          <ChartLegend items={SIGN_IN_BANDS} />
        </ChartCard>
      ) : null}

      {engagement ? (
        <ChartCard
          title="What they are asking"
          description={`Questions put to Sonae each day, over the last ${engagement.daysBack} days.`}
        >
          <div className="w-full">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={engagement.daily} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="var(--color-border-dim)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={formatDay}
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
        <h2 className="text-[15px] font-semibold text-foreground">People</h2>

        <TableShell minWidthClassName="min-w-[820px]">
          <thead>
            <TableHeaderRow>
              <TableHeaderCell>Person</TableHeaderCell>
              <TableHeaderCell>Last seen</TableHeaderCell>
              <TableHeaderCell>Sign-ins</TableHeaderCell>
              <TableHeaderCell>Questions</TableHeaderCell>
              <TableHeaderCell>Agents run</TableHeaderCell>
            </TableHeaderRow>
          </thead>
          <tbody>
            {engagement === undefined ? (
              <TableLoadingRow colSpan={5} />
            ) : everyone.length === 0 ? (
              <TableEmptyRow
                colSpan={5}
                icon={<Users className="h-8 w-8 text-muted/30" />}
                label="Nobody here yet"
                action={
                  <Link
                    href={`/admin/companies/${companyId}/directory/invites`}
                    className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline"
                  >
                    Invite someone
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
            ) : (
              everyone.map((person) => {
                const lastSeen = describeLastSeen(person.lastSeenAt);
                return (
                  <tr key={person.userId} className="border-b border-border-dim/50">
                    <td className="px-4 py-3 align-top">
                      <div className="text-[13px] font-medium text-foreground">
                        {person.name}
                        {person.isAdmin ? <span className="ml-2 text-[12px] text-muted">Admin</span> : null}
                      </div>
                      <div className="text-[12px] text-muted">{person.email}</div>
                    </td>
                    {/* Least recently seen sorts to the top, so the people worth
                        a call are the first thing read. */}
                    <td className={cn("px-4 py-3 align-top text-[13px]", lastSeen.stale ? "text-[#f59e0b]" : "text-secondary")}>
                      {lastSeen.label}
                    </td>
                    <td className="px-4 py-3 align-top text-[13px] text-secondary">{person.signIns}</td>
                    <td className="px-4 py-3 align-top text-[13px] text-secondary">{person.questions}</td>
                    <td className="px-4 py-3 align-top text-[13px] text-secondary">{person.agentRuns}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </TableShell>
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
              {invitations.pending} {invitations.pending === 1 ? "person has" : "people have"} been invited and not arrived
            </div>
            <div className="mt-0.5 text-[13px] text-secondary">
              They cannot use Sonae until they accept.
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] text-brand">
            Open invitations
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>
      ) : null}

      {/* Kept deliberately. A screen that measures people has to say who it
          cannot see, or the numbers get read as the whole truth. */}
      {engagement ? (
        <div className="rounded-[10px] border border-border-dim bg-card/30 px-4 py-3">
          <div className="text-[12px] font-medium text-secondary">What this does not cover</div>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-[12px] leading-relaxed text-muted">
            <li>People who run the platform are left out, so their activity is never counted as this company&apos;s.</li>
            <li>Visitors using the public chat widget are anonymous and cannot be tied to a person here.</li>
            <li>Sign-ins are recorded once an hour per device, so this counts sessions rather than page loads.</li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
