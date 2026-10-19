import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { accessTokenFor } from "./googleAnalyticsConnect";
import { THRESHOLDED_DIMENSIONS, runFunnelReport, runRealtimeReport, runReport, type FunnelAsk, type QuotaLeft, type RealtimeAsk, type ReportAsk, type ReportRow, type ReportSink, type Report } from "./googleAnalyticsApi";
import type { GoogleFailure } from "./googleApi";
import { HOURLY_REFUSAL, overBudget, quotaStillSeen } from "./googleAnalyticsBudget";

/**
 * A collection step's hold on Google Analytics (docs/plans/active/google-analytics-plan.md
 * §4): its sign-in, renewed once when it has just expired; each ask, kept to
 * the run's budget for the hour (ga-stored-figures-plan.md SF17); and Google
 * waited for a little when it is busy. Moved here from
 * `googleAnalyticsCollect.ts`, which names it as before.
 */

/** Waits before asking a busy Google again. */
const BUSY_WAITS_MS = [2_000, 8_000];

/** A step's hold on Google: the token, renewed once when it has just expired. */
export type Session = {
  ctx: ActionCtx;
  connectionId: Id<"googleAnalyticsConnections">;
  accessToken: string;
  requests: number;
  /** Set when renewing the token failed; the problem is already noted on the connection. */
  stopped: string | null;
  /** What is left of the website's allowances, as Google counted them on its last answer (SF18); null before one. */
  quota: QuotaLeft | null;
};

/** A session's start: its sign-in, and what Google last said is left while it holds (`googleAnalyticsQuota.ts`). */
export async function openSession(
  ctx: ActionCtx,
  connectionId: Id<"googleAnalyticsConnections">,
): Promise<{ ok: true; session: Session } | { ok: false; problem: string }> {
  const token = await accessTokenFor(ctx, connectionId);
  if (!token.ok) return { ok: false, problem: token.problem };
  const seen = await ctx.runQuery(internal.googleAnalyticsQuota.quotaSeenOf, { connectionId });
  return { ok: true, session: { ctx, connectionId, accessToken: token.accessToken, requests: 0, stopped: null, quota: quotaStillSeen(seen, Date.now()) } };
}

/**
 * One report, renewing the token once if it has just expired and waiting a
 * little when Google is busy — and not asked at all once the run's budget
 * for the hour is spent (SF17).
 */
export async function ask(session: Session, property: string, report: ReportAsk, sink?: ReportSink): Promise<({ ok: true } & Report) | GoogleFailure> {
  // Asked again after a failure part-way: with a sink, from the page Google reached (ga-big-site-reliability-plan.md BR2).
  let fromPage = 0;
  return await retried(session, async (token) => {
    const answer = await runReport(token, property, report, sink, fromPage);
    if (!answer.ok) fromPage = answer.pagesRead;
    if (answer.ok && answer.quota) session.quota = answer.quota;
    if (answer.ok && answer.quota) await session.ctx.runMutation(internal.googleAnalyticsQuota.noteQuota, { connectionId: session.connectionId, quota: answer.quota });
    return { answer, requests: answer.ok ? answer.requests : 1 };
  }, { budgeted: true, thresholded: report.dimensions.some((dimension) => THRESHOLDED_DIMENSIONS.has(dimension)) });
}

/** Google's live figures (§18.6.7), asked as every report is; nothing is kept. */
export async function askRealtime(session: Session, property: string, live: RealtimeAsk): Promise<{ ok: true; rows: ReportRow[] } | GoogleFailure> {
  return await retried(session, async (token) => ({ answer: await runRealtimeReport(token, property, live), requests: 1 }));
}

/**
 * Who did an event and then one of others (§18.6.5), asked as every report is: its sign-in renewed, Google waited for
 * when busy. A collection's funnel (`budgeted`, ga-conversions-visitors-plan.md CV4) keeps to the run's budget; one
 * asked from an event's screen does not: what is kept back is for it (SF17).
 */
export async function askFunnel(session: Session, property: string, funnel: FunnelAsk, budgeted = false): Promise<{ ok: true; did: number; then: number; narrowed?: true } | GoogleFailure> {
  return await retried(session, async (token) => {
    const answer = await runFunnelReport(token, property, funnel);
    // Asked again the old way when Google refused a step held to its own addresses: two asks.
    return { answer, requests: answer.ok && answer.narrowed ? 2 : 1 };
  }, { budgeted });
}

/**
 * One ask of Google, its sign-in renewed once when it ran out and asked again
 * a little later when Google was busy. A collection's ask (`budgeted`) is not
 * made once its budget for the hour is spent (`BUDGET`); a refusal for an
 * allowance that refreshes within the hour is not asked again a few seconds
 * later — the run waits for the hour (SF20).
 */
async function retried<Answer extends { ok: true } | GoogleFailure>(
  session: Session,
  call: (accessToken: string) => Promise<{ answer: Answer; requests: number }>,
  budget: { budgeted: boolean; thresholded?: boolean } = { budgeted: false },
): Promise<Answer> {
  let renewed = false;
  for (let wait = 0; ;) {
    const spent = budget.budgeted ? overBudget(session.quota, budget.thresholded === true) : null;
    if (spent) return { ok: false, reason: "BUDGET", status: 0, detail: spent } as Answer;
    const { answer, requests } = await call(session.accessToken);
    session.requests += requests;
    if (answer.ok) return answer;
    if (answer.reason === "EXPIRED" && !renewed) {
      renewed = true;
      const token = await accessTokenFor(session.ctx, session.connectionId, true);
      if (!token.ok) {
        session.stopped = token.problem;
        return answer;
      }
      session.accessToken = token.accessToken;
      continue;
    }
    if ((answer.reason === "BUSY" || answer.reason === "UNREACHABLE") && wait < BUSY_WAITS_MS.length && !HOURLY_REFUSAL.test(answer.detail)) {
      await new Promise((resolve) => setTimeout(resolve, BUSY_WAITS_MS[wait]));
      wait += 1;
      continue;
    }
    return answer;
  }
}
