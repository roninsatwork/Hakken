import type { Doc, Id } from "./_generated/dataModel";
import { superAdminQuery } from "./tenantFunctions";
import { buildModelCostContext, computeCostFromMap, convertUsdToGbp } from "./analyticsService";

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;

const COMPANY_LIMIT = 500;
const USER_LIMIT = 5000;
const PLAN_LIMIT = 100;
const MESSAGE_LIMIT = 20000;
const LOGIN_LIMIT = 20000;
const RUN_LIMIT = 5000;
const MODEL_LIMIT = 10000;
const INVITATION_LIMIT = 2000;

/** A client is worth a look once someone has stopped using it. */
type ClientState = "HEALTHY" | "NEEDS_ATTENTION" | "UNUSED";

function dayKey(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/** Ends today, so the most recent day — the one anyone looks for — is included. */
function buildDayKeys(now: number, days: number) {
  const keys: string[] = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    keys.push(dayKey(now - index * DAY_MS));
  }
  return keys;
}

/**
 * How the business is doing, and which client needs attention today.
 *
 * The screen this feeds reported tokens, model mix and provider mix — the same
 * view the per-company AI Usage screen already gives, aggregated. None of that
 * answers either question a platform owner opens the front page to ask.
 *
 * Counts are read rather than accumulated. The figures they replace came from a
 * rollup that is only ever incremented on create and decremented on delete, so
 * anything seeded, imported, or simply older than the counter was invisible to
 * it forever — which is why the dashboard said nought companies while companies
 * plainly existed, and nought revenue with them.
 */
export const getPlatformOverview = superAdminQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - WINDOW_DAYS * DAY_MS;
    const dayKeys = buildDayKeys(now, WINDOW_DAYS);

    const [companies, users, plans, models] = await Promise.all([
      ctx.db.query("companies").take(COMPANY_LIMIT),
      ctx.db.query("users").take(USER_LIMIT),
      ctx.db.query("plans").take(PLAN_LIMIT),
      ctx.db.query("aiModels").take(MODEL_LIMIT),
    ]);

    const planById = new Map(plans.map((plan) => [plan._id as Id<"plans">, plan]));
    const { modelMap } = buildModelCostContext(models);

    // Platform staff are excluded everywhere: counting the people who run Sonae
    // as client engagement is how an unused platform looks busy.
    const clientUsers = users.filter((candidate) => candidate.role !== "SUPER_ADMIN");
    const usersByCompany = new Map<string, Doc<"users">[]>();
    for (const person of clientUsers) {
      if (!person.companyId) continue;
      const existing = usersByCompany.get(person.companyId) ?? [];
      existing.push(person);
      usersByCompany.set(person.companyId, existing);
    }
    const companyIdByUser = new Map(clientUsers.map((person) => [person._id as string, person.companyId]));

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", cutoff))
      .take(MESSAGE_LIMIT);

    const logins = await ctx.db
      .query("logins")
      .withIndex("by_timestamp", (q) => q.gte("timestamp", cutoff))
      .take(LOGIN_LIMIT);

    // There is no by-started index across every status, so this asks per status
    // and merges — the same approach the run observatory takes.
    const runsByStatus = await Promise.all(
      (["QUEUED", "RUNNING", "PENDING_APPROVAL", "SUCCESS", "FAILED", "CANCELLED"] as const).map((status) =>
        ctx.db
          .query("agentRuns")
          .withIndex("by_status_started", (q) => q.eq("status", status).gte("startedAt", cutoff))
          .take(RUN_LIMIT)
      )
    );
    const runs = runsByStatus.flat();

    const invitations = await ctx.db.query("invitations").take(INVITATION_LIMIT);

    const daily = new Map(dayKeys.map((key) => [key, {
      day: key,
      questions: 0,
      aiCalls: 0,
      spendGBP: 0,
    }]));

    const activeUserIds = new Set<string>();
    const lastSeenByUser = new Map<string, number>();
    const activeUsersByCompanyRecent = new Map<string, Set<string>>();
    const recentCutoff = now - 7 * DAY_MS;
    const signInsPerPersonPerDay = new Map<string, Map<string, number>>();
    for (const key of dayKeys) signInsPerPersonPerDay.set(key, new Map());

    let aiSpendGBP = 0;

    const noteActivity = (userId: string | undefined, at: number) => {
      if (!userId) return;
      activeUserIds.add(userId);
      lastSeenByUser.set(userId, Math.max(lastSeenByUser.get(userId) ?? 0, at));
      if (at < recentCutoff) return;
      const companyId = companyIdByUser.get(userId);
      if (!companyId) return;
      const set = activeUsersByCompanyRecent.get(companyId) ?? new Set<string>();
      set.add(userId);
      activeUsersByCompanyRecent.set(companyId, set);
    };

    for (const message of messages) {
      const bucket = daily.get(dayKey(message.createdAt));
      if (!bucket) continue;
      // Every message is an AI call; only the ones a person typed are questions.
      // The gap between the two lines is automation running unasked.
      bucket.aiCalls += 1;
      const cost = convertUsdToGbp(computeCostFromMap(
        message.modelUsed ?? "",
        message.inputTokens ?? 0,
        message.outputTokens ?? 0,
        modelMap,
      ));
      bucket.spendGBP += cost;
      aiSpendGBP += cost;
      if (message.role !== "user") continue;
      bucket.questions += 1;
      noteActivity(message.userId, message.createdAt);
    }

    for (const login of logins) {
      if (login.status !== "SUCCESS") continue;
      if (!companyIdByUser.has(login.userId)) continue;
      noteActivity(login.userId, login.timestamp);
      const perPerson = signInsPerPersonPerDay.get(dayKey(login.timestamp));
      if (!perPerson) continue;
      perPerson.set(login.userId, (perPerson.get(login.userId) ?? 0) + 1);
    }

    for (const run of runs) {
      const bucket = daily.get(dayKey(run.startedAt));
      if (bucket) bucket.aiCalls += 1;
      noteActivity(run.userId, run.startedAt);
    }

    const signInBands = dayKeys.map((key) => {
      const perPerson = signInsPerPersonPerDay.get(key) ?? new Map<string, number>();
      const counts = [0, 0, 0, 0, 0];
      for (const sessions of perPerson.values()) counts[Math.min(sessions, 5) - 1] += 1;
      return {
        day: key,
        didNotSignIn: Math.max(clientUsers.length - perPerson.size, 0),
        oneSession: counts[0],
        twoSessions: counts[1],
        threeSessions: counts[2],
        fourSessions: counts[3],
        fivePlusSessions: counts[4],
      };
    });

    let projectedMrrGBP = 0;
    const planCounts = new Map<string, { name: string; companies: number }>();
    let companiesWithNoPlan = 0;

    const portfolio = companies.map((company) => {
      const people = usersByCompany.get(company._id) ?? [];
      const plan = company.planId ? planById.get(company.planId) : undefined;
      if (plan) {
        projectedMrrGBP += plan.priceGBP;
        const entry = planCounts.get(plan._id) ?? { name: plan.name, companies: 0 };
        entry.companies += 1;
        planCounts.set(plan._id, entry);
      } else {
        companiesWithNoPlan += 1;
      }

      const activeRecently = activeUsersByCompanyRecent.get(company._id)?.size ?? 0;
      const quiet = people.filter((person) => !activeUserIds.has(person._id)).length;
      // Unused and unhealthy are different problems: one has nobody in it, the
      // other has people who have stopped. Saying so lets the reader act.
      const state: ClientState = people.length === 0
        ? "UNUSED"
        : quiet > 0 ? "NEEDS_ATTENTION" : "HEALTHY";

      return {
        companyId: company._id,
        name: company.name,
        planName: plan?.name,
        mrrGBP: plan?.priceGBP ?? 0,
        people: people.length,
        activeRecently,
        quiet,
        state,
      };
    });

    // Worst first: a client nobody is using is the reason to open this screen.
    const stateRank: Record<ClientState, number> = { NEEDS_ATTENTION: 0, UNUSED: 1, HEALTHY: 2 };
    portfolio.sort((left, right) => stateRank[left.state] - stateRank[right.state] || right.quiet - left.quiet);

    const pendingInvitations = invitations.filter((invitation) => invitation.status === "PENDING").length;

    // A month of revenue against a month of spend, both over the same window,
    // so the proportion means something. A bare revenue figure hides the margin.
    const spendAsPercentOfRevenue = projectedMrrGBP > 0
      ? Number(((aiSpendGBP / projectedMrrGBP) * 100).toFixed(1))
      : null;

    return {
      windowDays: WINDOW_DAYS,
      clients: {
        total: companies.length,
        healthy: portfolio.filter((client) => client.state === "HEALTHY").length,
        needsAttention: portfolio.filter((client) => client.state === "NEEDS_ATTENTION").length,
        unused: portfolio.filter((client) => client.state === "UNUSED").length,
      },
      money: {
        projectedMrrGBP: Number(projectedMrrGBP.toFixed(2)),
        aiSpendGBP: Number(aiSpendGBP.toFixed(2)),
        spendAsPercentOfRevenue,
      },
      seats: {
        total: clientUsers.length,
        active: activeUserIds.size,
        utilisation: clientUsers.length > 0
          ? Number(((activeUserIds.size / clientUsers.length) * 100).toFixed(0))
          : 0,
      },
      todo: {
        pendingInvitations,
        companiesWithNoPlan,
      },
      planDistribution: [
        ...Array.from(planCounts.values()),
        ...(companiesWithNoPlan > 0 ? [{ name: "No plan", companies: companiesWithNoPlan }] : []),
      ].sort((left, right) => right.companies - left.companies),
      daily: dayKeys.map((key) => {
        const bucket = daily.get(key)!;
        return { ...bucket, spendGBP: Number(bucket.spendGBP.toFixed(4)) };
      }),
      signInBands,
      portfolio,
    };
  },
});
