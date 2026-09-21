import type { QueryCtx } from "./_generated/server";
import { getDecision } from "./decisionRegistry";
import type { OperationalFailureExample } from "./platformAlertService";
import type { HealthScope } from "./systemHealth";

/**
 * Bounded reads. A week of Decision runs past this reads as "at least";
 * the platform's read register keeps every unregistered read under a
 * thousand rows, and a health line is directional, not a ledger.
 */
const DECISION_HEALTH_LIMIT = 999;
const HEALTH_EXAMPLE_LIMIT = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How the Decisions have been going (decisions-typesafe-plan.md, Phase E).
 *
 * Three questions the Health page can answer from the run rows alone:
 * how many answers were handed to a person in the window; how many runs
 * fell back to the simple rule while a Decision was switched on (no model
 * chosen, or TypeSafe not answering); and whether any Decision is unsure
 * far more often than it has been — its share of "not sure" over the
 * window more than double its share over thirty days, on enough runs to
 * mean something. That last one is the early sign a question needs
 * rewording. Bounded reads, capped like the rest of this report.
 */
const DECISION_UNSURE_MIN_RUNS = 20;
const DECISION_UNSURE_MIN_SHARE = 0.2;
const DECISION_BASELINE_DAYS = 30;

export async function getDecisionHealth(ctx: QueryCtx, args: { scope?: HealthScope; windowStartTs: number; now: number }) {
  const readRuns = async (since: number) => {
    if (args.scope?.type === "company" && args.scope.companyId) {
      return await ctx.db
        .query("decisionRuns")
        .withIndex("by_company_created", (q) => q.eq("companyId", args.scope!.companyId).gte("createdAt", since))
        .order("desc")
        .take(DECISION_HEALTH_LIMIT);
    }
    return await ctx.db
      .query("decisionRuns")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", since))
      .order("desc")
      .take(DECISION_HEALTH_LIMIT);
  };

  const windowRuns = await readRuns(args.windowStartTs);
  const nameOf = (key: string) => getDecision(key)?.name ?? key;
  const latestByKey = (rows: typeof windowRuns) => {
    const byKey = new Map<string, { key: string; count: number; latest: number }>();
    for (const row of rows) {
      const entry = byKey.get(row.decisionKey) ?? { key: row.decisionKey, count: 0, latest: 0 };
      entry.count += 1;
      entry.latest = Math.max(entry.latest, row.createdAt);
      byKey.set(row.decisionKey, entry);
    }
    return [...byKey.values()].sort((a, b) => b.count - a.count);
  };

  const handed = windowRuns.filter((run) => run.outcome === "HANDED_TO_PERSON");
  const handedToPerson = {
    count: handed.length,
    examples: latestByKey(handed).slice(0, HEALTH_EXAMPLE_LIMIT).map((entry): OperationalFailureExample => ({
      id: entry.key,
      label: nameOf(entry.key),
      occurredAt: entry.latest,
      summary: `${entry.count} handed to a person`,
      targetType: "decision",
    })),
  };

  const fellBack = windowRuns.filter(
    (run) => run.source === "RULES" && (run.fallbackReason === "NO_MODEL" || run.fallbackReason === "PROVIDER_FAILED"),
  );
  const onSimpleRules = {
    count: fellBack.length,
    examples: latestByKey(fellBack).slice(0, HEALTH_EXAMPLE_LIMIT).map((entry): OperationalFailureExample => ({
      id: entry.key,
      label: nameOf(entry.key),
      occurredAt: entry.latest,
      summary: `${entry.count} answered by the simple rule while switched on`,
      targetType: "decision",
    })),
  };

  // The unsure spike needs the longer baseline; read it only when the
  // window holds enough runs for the comparison to mean anything.
  const unsureExamples: OperationalFailureExample[] = [];
  if (windowRuns.length >= DECISION_UNSURE_MIN_RUNS) {
    const baselineRuns = await readRuns(args.now - DECISION_BASELINE_DAYS * DAY_MS);
    const share = (rows: typeof windowRuns, key: string) => {
      const mine = rows.filter((run) => run.decisionKey === key && run.source !== "RULES");
      if (mine.length === 0) return { share: 0, total: 0 };
      return { share: mine.filter((run) => run.certainty === "NOT_SURE").length / mine.length, total: mine.length };
    };
    for (const entry of latestByKey(windowRuns)) {
      const recent = share(windowRuns, entry.key);
      const baseline = share(baselineRuns, entry.key);
      if (recent.total < DECISION_UNSURE_MIN_RUNS) continue;
      if (recent.share < DECISION_UNSURE_MIN_SHARE) continue;
      if (recent.share <= baseline.share * 2) continue;
      unsureExamples.push({
        id: entry.key,
        label: nameOf(entry.key),
        occurredAt: entry.latest,
        summary: `Not sure on ${Math.round(recent.share * 100)}% of ${recent.total} runs, against ${Math.round(baseline.share * 100)}% over ${DECISION_BASELINE_DAYS} days`,
        targetType: "decision",
      });
    }
  }
  const unsure = { count: unsureExamples.length, examples: unsureExamples };

  return { handedToPerson, onSimpleRules, unsure };
}
