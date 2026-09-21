import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { adminQuery } from "./tenantFunctions";
import * as governanceShapes from "./utils/governanceShapes";
import { assertAdminCanAccessCompany } from "./authz";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS_BACK = 30;
const MAX_DAYS_BACK = 365;

/** A company's own people. Far above any real headcount, and bounds the reads. */
const COMPANY_PEOPLE_LIMIT = 500;
/** Sign-ins are throttled to one an hour per device, so this is months of them. */
const PER_PERSON_LOGIN_LIMIT = 2000;
const PER_PERSON_QUESTION_LIMIT = 2000;
const COMPANY_RUN_LIMIT = 5000;
const COMPANY_INVITATION_LIMIT = 500;

export type CompanyEngagementPerson = {
  userId: Id<"users">;
  name: string;
  email: string;
  isAdmin: boolean;
  /** The most recent of: signed in, asked a question, launched an agent. */
  lastSeenAt?: number;
  signIns: number;
  questions: number;
  agentRuns: number;
};

function resolveDaysBack(daysBack?: number) {
  if (!daysBack || !Number.isFinite(daysBack)) return DEFAULT_DAYS_BACK;
  return Math.min(Math.max(Math.round(daysBack), 1), MAX_DAYS_BACK);
}

function personName(user: Doc<"users">) {
  return user.name?.trim() || user.email?.trim() || "Unnamed person";
}

/** A day key, so a timestamp can be bucketed into the day it happened on. */
function dayKey(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * Every day in the window, ending today, so a day with nothing still draws a bar.
 *
 * Counted back from now rather than forward from the cutoff: forward from the
 * cutoff lands the last bar on yesterday, and today's activity — the activity
 * anyone opening this screen is most likely looking for — falls outside it.
 */
function buildDayKeys(now: number, days: number) {
  const keys: string[] = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    keys.push(dayKey(now - index * DAY_MS));
  }
  return keys;
}

/** Distinct calendar days, so ten sign-ins on one day is not ten days of use. */
function countDistinctDays(timestamps: number[]) {
  const days = new Set(timestamps.map((timestamp) => new Date(timestamp).toISOString().slice(0, 10)));
  return days.size;
}

function latest(...values: Array<number | undefined>) {
  const present = values.filter((value): value is number => typeof value === "number");
  return present.length > 0 ? Math.max(...present) : undefined;
}

async function readPersonActivity(ctx: QueryCtx, args: {
  user: Doc<"users">;
  cutoff: number;
}) {
  const logins = await ctx.db
    .query("logins")
    .withIndex("by_user", (q) => q.eq("userId", args.user._id).gte("timestamp", args.cutoff))
    .take(PER_PERSON_LOGIN_LIMIT);
  const successfulLogins = logins.filter((login) => login.status === "SUCCESS");

  // `role` here is the message author, not the person's permissions: only what
  // someone typed counts as a question asked.
  const questions = await ctx.db
    .query("messages")
    .withIndex("by_user_role_created", (q) =>
      q.eq("userId", args.user._id).eq("role", "user").gte("createdAt", args.cutoff))
    .take(PER_PERSON_QUESTION_LIMIT);

  return { logins: successfulLogins, questions };
}

/**
 * What a company's people have actually been doing.
 *
 * Deliberately about people rather than spend. The screen this feeds replaced a
 * company "Dashboard" that reported tokens, quota and provider cost — a billing
 * view under a name that promised an account view. Cost still has a home, on the
 * AI Usage screen; this answers who is using Hakken, how often, and who has gone
 * quiet.
 *
 * Super admins are excluded throughout. They are the people running the
 * platform, and counting their sign-ins as client engagement is how a workspace
 * with no real users still looks busy.
 */
export const getCompanyEngagement = adminQuery({
  args: {
    companyId: v.id("companies"),
    daysBack: v.optional(v.number()),
  },
  returns: governanceShapes.companyEngagementShape,
  handler: async (ctx, args) => {
    const { user } = ctx;
    assertAdminCanAccessCompany(user, args.companyId);

    const daysBack = resolveDaysBack(args.daysBack);
    const cutoff = Date.now() - daysBack * DAY_MS;

    const companyUsers = await ctx.db
      .query("users")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .take(COMPANY_PEOPLE_LIMIT);
    const people = companyUsers.filter((candidate) => candidate.role !== "SUPER_ADMIN");

    // One read for the company's runs, then attributed in memory. There is no
    // by-user index on runs, and a query per person would be worse.
    const companyRuns = await ctx.db
      .query("agentRuns")
      .withIndex("by_company_started", (q) => q.eq("companyId", args.companyId).gte("startedAt", cutoff))
      .take(COMPANY_RUN_LIMIT);
    const runsByUser = new Map<string, { count: number; lastAt: number }>();
    for (const run of companyRuns) {
      if (!run.userId) continue;
      const existing = runsByUser.get(run.userId);
      runsByUser.set(run.userId, {
        count: (existing?.count ?? 0) + 1,
        lastAt: Math.max(existing?.lastAt ?? 0, run.startedAt),
      });
    }

    const rows: CompanyEngagementPerson[] = [];
    const allLoginTimestamps: number[] = [];
    let totalQuestions = 0;
    let peopleWhoAsked = 0;

    // Per day, how many people signed in that many times. The bar's height is
    // always the headcount, so "did not sign in" is the rest of the column
    // rather than an absence the reader has to infer.
    const dayKeys = buildDayKeys(Date.now(), daysBack);
    const signInsPerPersonPerDay = new Map<string, Map<string, number>>();
    const questionsPerDay = new Map<string, number>();
    for (const key of dayKeys) {
      signInsPerPersonPerDay.set(key, new Map());
      questionsPerDay.set(key, 0);
    }

    for (const person of people) {
      const { logins, questions } = await readPersonActivity(ctx, { user: person, cutoff });
      const runs = runsByUser.get(person._id);

      allLoginTimestamps.push(...logins.map((login) => login.timestamp));
      totalQuestions += questions.length;
      if (questions.length > 0) peopleWhoAsked += 1;

      for (const login of logins) {
        const perPerson = signInsPerPersonPerDay.get(dayKey(login.timestamp));
        if (!perPerson) continue;
        perPerson.set(person._id, (perPerson.get(person._id) ?? 0) + 1);
      }
      for (const question of questions) {
        const key = dayKey(question.createdAt);
        if (!questionsPerDay.has(key)) continue;
        questionsPerDay.set(key, (questionsPerDay.get(key) ?? 0) + 1);
      }

      rows.push({
        userId: person._id,
        name: personName(person),
        email: person.email ?? "",
        isAdmin: person.role === "ADMIN",
        // Every kind of activity counts. Reading sign-ins alone would show
        // someone who only ever launches agents as never seen.
        lastSeenAt: latest(
          ...logins.map((login) => login.timestamp),
          ...questions.map((question) => question.createdAt),
          runs?.lastAt,
        ),
        signIns: logins.length,
        questions: questions.length,
        agentRuns: runs?.count ?? 0,
      });
    }

    // Least recently seen first. Sorting by heaviest user makes a billing
    // leaderboard; sorting by who has gone quiet puts the people worth a call at
    // the top. Anyone never seen at all sorts first.
    rows.sort((left, right) => (left.lastSeenAt ?? 0) - (right.lastSeenAt ?? 0));

    const activePeople = rows.filter((row) => typeof row.lastSeenAt === "number").length;

    const daily = dayKeys.map((key) => {
      const perPerson = signInsPerPersonPerDay.get(key) ?? new Map<string, number>();
      const counts = [0, 0, 0, 0, 0];
      for (const sessions of perPerson.values()) {
        // Five or more collapses into the last band: past five the exact number
        // stops changing what anyone would do about it.
        const band = Math.min(sessions, 5) - 1;
        counts[band] += 1;
      }
      return {
        day: key,
        didNotSignIn: Math.max(rows.length - perPerson.size, 0),
        oneSession: counts[0],
        twoSessions: counts[1],
        threeSessions: counts[2],
        fourSessions: counts[3],
        fivePlusSessions: counts[4],
        questions: questionsPerDay.get(key) ?? 0,
      };
    });

    const invitations = await ctx.db
      .query("invitations")
      .withIndex("by_company_status", (q) => q.eq("companyId", args.companyId))
      .take(COMPANY_INVITATION_LIMIT);

    return {
      daysBack,
      people: {
        total: rows.length,
        active: activePeople,
        quiet: rows.length - activePeople,
      },
      questions: {
        asked: totalQuestions,
        byPeople: peopleWhoAsked,
      },
      signIns: {
        total: allLoginTimestamps.length,
        onDays: countDistinctDays(allLoginTimestamps),
      },
      // No expiry exists on an invitation — the status is pending, accepted or
      // revoked — so nothing here claims one does.
      invitations: {
        pending: invitations.filter((invitation) => invitation.status === "PENDING").length,
        accepted: invitations.filter((invitation) => invitation.status === "ACCEPTED").length,
        revoked: invitations.filter((invitation) => invitation.status === "REVOKED").length,
      },
      daily,
      everyone: rows,
    };
  },
});
