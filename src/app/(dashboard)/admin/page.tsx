"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AlertTriangle, ArrowRight, CircleCheck, LayoutDashboard, MailPlus } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
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
  clients: { total: number; healthy: number; needsAttention: number; unused: number };
  money: { projectedMrrGBP: number; aiSpendGBP: number; spendAsPercentOfRevenue: number | null };
  seats: { total: number; active: number; utilisation: number };
  todo: { pendingInvitations: number; companiesWithNoPlan: number };
  planDistribution: Array<{ name: string; companies: number }>;
  daily: Array<{ day: string; questions: number; aiCalls: number; spendGBP: number }>;
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
  { key: "didNotSignIn", label: "Did not sign in", fill: "#4d4d52" },
  { key: "oneSession", label: "1 session", fill: "#256abf" },
  { key: "twoSessions", label: "2 sessions", fill: "#3987e5" },
  { key: "threeSessions", label: "3 sessions", fill: "#6da7ec" },
  { key: "fourSessions", label: "4 sessions", fill: "#9ec5f4" },
  { key: "fivePlusSessions", label: "5+ sessions", fill: "#cde2fb" },
] as const;

/** Two unrelated series, so two categorical slots rather than one ramp. */
const ACTIVITY_SERIES = [
  { key: "questions", label: "Questions people asked", stroke: "#3987e5" },
  { key: "aiCalls", label: "All AI calls, including automation", stroke: "#8a8a90" },
] as const;

const STATE_LABELS: Record<ClientState, string> = {
  HEALTHY: "Healthy",
  NEEDS_ATTENTION: "Needs attention",
  UNUSED: "Nobody added",
};

const STATE_CLASSES: Record<ClientState, string> = {
  HEALTHY: "text-[#10b981]",
  NEEDS_ATTENTION: "text-[#f59e0b]",
  UNUSED: "text-muted",
};

const AXIS_TICK = { fontSize: 11, fill: "var(--color-muted)" } as const;

function formatDay(day: string) {
  return new Date(`${day}T00:00:00Z`)
    .toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
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

function TooltipShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-border-dim bg-card px-3 py-2 shadow-lg">
      <div className="text-[12px] font-medium text-foreground">{title}</div>
      {children}
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
    .map((band) => ({ band, value: payload.find((entry) => entry.dataKey === band.key)?.value ?? 0 }))
    .filter((row) => row.value > 0);
  return (
    <TooltipShell title={label ? formatDay(label) : ""}>
      {rows.map((row) => (
        <div key={row.band.key} className="mt-1 flex items-center gap-2 text-[12px] text-secondary">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: row.band.fill }} />
          {row.value} {row.value === 1 ? "person" : "people"} · {row.band.label.toLowerCase()}
        </div>
      ))}
    </TooltipShell>
  );
}

function ActivityTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <TooltipShell title={label ? formatDay(label) : ""}>
      {ACTIVITY_SERIES.map((series) => (
        <div key={series.key} className="mt-1 flex items-center gap-2 text-[12px] text-secondary">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: series.stroke }} />
          {payload.find((entry) => entry.dataKey === series.key)?.value ?? 0} · {series.label.toLowerCase()}
        </div>
      ))}
    </TooltipShell>
  );
}

function SpendTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <TooltipShell title={label ? formatDay(label) : ""}>
      <div className="mt-1 text-[12px] text-secondary">{formatSpend(payload[0]?.value ?? 0)} spent</div>
    </TooltipShell>
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
  const overview = useQuery(api.platformOverview.getPlatformOverview, {}) as PlatformOverview | undefined;

  const clients = overview?.clients;
  const portfolio = overview?.portfolio ?? [];
  const needsAction = (overview?.todo.pendingInvitations ?? 0) + (overview?.todo.companiesWithNoPlan ?? 0);
  const allWell = clients !== undefined && clients.needsAttention === 0 && clients.unused === 0;

  const headline = !overview
    ? "Counting clients, seats and activity."
    : clients!.total === 0
      ? "No clients yet."
      : allWell
        ? `All ${clients!.total} clients are healthy.`
        : [
          `${clients!.healthy} of ${clients!.total} clients healthy`,
          clients!.needsAttention > 0 ? `${clients!.needsAttention} need attention` : null,
          clients!.unused > 0 ? `${clients!.unused} with nobody added` : null,
        ].filter(Boolean).join(" · ") + ".";

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        icon={<LayoutDashboard className="h-6 w-6 text-brand" />}
        title="Admin Dashboard"
        description="How the business is doing, and which client needs you today."
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

      {overview ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Revenue against what it costs to serve. A bare revenue figure hides
              the margin, which is the number that decides whether this works. */}
          <div className="rounded-[16px] border border-border-dim bg-card/40 p-5">
            <div className="text-[12px] font-medium text-secondary">Projected monthly revenue</div>
            <div className="mt-1 text-[28px] font-semibold text-foreground">
              {formatRevenue(overview.money.projectedMrrGBP)}
            </div>
            <div className="mt-1 text-[12px] text-muted">
              {overview.money.spendAsPercentOfRevenue === null
                ? `AI spend ${formatSpend(overview.money.aiSpendGBP)} · no plans priced yet`
                : `AI spend ${formatSpend(overview.money.aiSpendGBP)} · ${overview.money.spendAsPercentOfRevenue}% of it`}
            </div>
          </div>
          <div className="rounded-[16px] border border-border-dim bg-card/40 p-5">
            <div className="text-[12px] font-medium text-secondary">Seats in use</div>
            <div className="mt-1 text-[28px] font-semibold text-foreground">
              {overview.seats.active} <span className="text-[16px] font-normal text-muted">of {overview.seats.total}</span>
            </div>
            <div className="mt-1 text-[12px] text-muted">
              {overview.seats.utilisation}% used in the last {overview.windowDays} days
            </div>
          </div>
          <div className="rounded-[16px] border border-border-dim bg-card/40 p-5">
            <div className="text-[12px] font-medium text-secondary">Clients needing attention</div>
            <div className={cn(
              "mt-1 text-[28px] font-semibold",
              clients!.needsAttention > 0 ? "text-[#f59e0b]" : "text-foreground",
            )}>
              {clients!.needsAttention}
            </div>
            <div className="mt-1 text-[12px] text-muted">someone there has stopped using Sonae</div>
          </div>
        </div>
      ) : null}

      {overview ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard
            title="Activity"
            description={`Questions people asked against everything the AI did, per day. Last ${overview.windowDays} days.`}
          >
            <div className="w-full">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={overview.daily} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="var(--color-border-dim)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tickFormatter={formatDay} tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24} />
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
            <ChartLegend items={ACTIVITY_SERIES.map((series) => ({ label: series.label, fill: series.stroke }))} />
          </ChartCard>

          <ChartCard
            title="AI spend"
            description={`What the models cost, per day. Last ${overview.windowDays} days.`}
          >
            <div className="w-full">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={overview.daily} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
                  <defs>
                    <linearGradient id="platform-spend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3987e5" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#3987e5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-border-dim)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tickFormatter={formatDay} tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(value: number) => `$${value.toFixed(2)}`} />
                  <Tooltip content={<SpendTooltip />} />
                  {/* One series, so the title names it and no legend is needed. */}
                  <Area
                    type="monotone"
                    dataKey="spendGBP"
                    stroke="#3987e5"
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
          title="How often people sign in"
          description={`Each bar is every client seat, banded by how many times they signed in that day. Last ${overview.windowDays} days, people who run the platform excluded.`}
        >
          <div className="w-full">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={overview.signInBands} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="var(--color-border-dim)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tickFormatter={formatDay} tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<SignInTooltip />} />
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
          <ChartLegend items={SIGN_IN_BANDS} />
        </ChartCard>
      ) : null}

      {overview && overview.planDistribution.length > 0 ? (
        <ChartCard
          title="Plans"
          description="How many client workspaces are on each plan."
          action={
            <Link href="/admin/settings/plans" className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-brand hover:underline">
              Manage plans
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          <div className="w-full">
            <ResponsiveContainer width="100%" height={Math.max(120, overview.planDistribution.length * 48)}>
              <BarChart data={overview.planDistribution} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 8 }}>
                <CartesianGrid stroke="var(--color-border-dim)" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" width={130} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="companies" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {/* Unpriced workspaces are revenue not collected, so they read
                      as absence rather than as another plan. */}
                  {overview.planDistribution.map((plan) => (
                    <Cell key={plan.name} fill={plan.name === "No plan" ? "#4d4d52" : "#3987e5"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-foreground">Clients</h2>

        <TableShell minWidthClassName="min-w-[900px]">
          <thead>
            <TableHeaderRow>
              <TableHeaderCell>Client</TableHeaderCell>
              <TableHeaderCell>State</TableHeaderCell>
              <TableHeaderCell>Active this week</TableHeaderCell>
              <TableHeaderCell>Gone quiet</TableHeaderCell>
              <TableHeaderCell>Revenue</TableHeaderCell>
              <TableHeaderCell align="right">{""}</TableHeaderCell>
            </TableHeaderRow>
          </thead>
          <tbody>
            {overview === undefined ? (
              <TableLoadingRow colSpan={6} />
            ) : portfolio.length === 0 ? (
              <TableEmptyRow
                colSpan={6}
                icon={<LayoutDashboard className="h-8 w-8 text-muted/30" />}
                label="No clients yet"
              />
            ) : (
              portfolio.map((client) => (
                <tr key={client.companyId} className="border-b border-border-dim/50">
                  <td className="px-4 py-3 align-top">
                    <div className="text-[13px] font-medium text-foreground">{client.name}</div>
                    <div className="text-[12px] text-muted">{client.planName ?? "No plan"}</div>
                  </td>
                  <td className={cn("px-4 py-3 align-top text-[13px]", STATE_CLASSES[client.state])}>
                    {STATE_LABELS[client.state]}
                  </td>
                  <td className="px-4 py-3 align-top text-[13px] text-secondary">
                    {client.activeRecently} of {client.people}
                  </td>
                  <td className="px-4 py-3 align-top text-[13px] text-secondary">{client.quiet}</td>
                  <td className="px-4 py-3 align-top text-[13px] text-secondary">{formatRevenue(client.mrrGBP)}</td>
                  <td className="px-4 py-3 align-top text-right">
                    <Link
                      href={`/admin/companies/${client.companyId}`}
                      className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline"
                    >
                      Open
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
      </section>

      {/* Only when there is something to do. A permanent panel of zeroes is the
          fault this whole pass has been removing. */}
      {overview && needsAction > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold text-foreground">Worth doing</h2>
          {overview.todo.pendingInvitations > 0 ? (
            <Link
              href="/admin/users/invite"
              className="flex items-start gap-3 rounded-[10px] border border-border-dim bg-card px-4 py-3 transition-colors hover:border-brand/40"
            >
              <MailPlus className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#f59e0b]" />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-foreground">
                  {overview.todo.pendingInvitations} {overview.todo.pendingInvitations === 1 ? "invitation" : "invitations"} nobody has accepted
                </div>
                <div className="mt-0.5 text-[13px] text-secondary">They cannot use Sonae until they do.</div>
              </div>
              <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] text-brand">
                Open invitations
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
                  {overview.todo.companiesWithNoPlan} {overview.todo.companiesWithNoPlan === 1 ? "client is" : "clients are"} on no plan
                </div>
                <div className="mt-0.5 text-[13px] text-secondary">They are being served and not billed.</div>
              </div>
              <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] text-brand">
                Open companies
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
