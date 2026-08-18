import {
  DAY_MS,
  dayKey,
  countRiskMix,
  type RiskMix,
  type SideEffectSummary,
} from "./governanceActivityService";
import {
  checkConformance,
  type ConformanceFinding,
  type SideEffectLevel,
} from "./conformanceService";
import {
  summariseRegister,
  type AiSystemEntry,
} from "./governanceRegisterService";

/**
 * The folds behind the governance rollups: raw rows in, bucket rows out, and
 * bucket rows in, screen figures out.
 *
 * Kept free of database access, like the services beside it, so the arithmetic
 * an auditor relies on can be tested directly — and so the agreement test can
 * run the same fold over the same rows two ways and insist the answers match.
 */

export const NO_COMPANY_KEY = "none";

export function companyKeyOf(companyId: string | undefined | null): string {
  return companyId ?? NO_COMPANY_KEY;
}

/** The register's scope rule, kept identical: companyless rows are in everybody's scope. */
export function scopeKeysFor(scopeCompanyId: string | undefined): string[] | undefined {
  return scopeCompanyId ? [scopeCompanyId, NO_COMPANY_KEY] : undefined;
}

export type RollupRunRow = {
  id: string;
  companyId?: string;
  agentId: string;
  startedAt: number;
  status: string;
};

export type RollupCallRow = {
  companyId?: string;
  agentId: string;
  startedAt: number;
  sideEffectLevel?: string;
};

export type AgentNameRow = { id: string; name: string; risk: string };

export type DayBucketRow = {
  companyKey: string;
  date: string;
  finished: number;
  waited: number;
  unfinished: number;
  runsTotal: number;
  actions: { read: number; write: number; external: number; destructive: number; total: number };
  perAgent: Array<{ agentId: string; name: string; risk: string; runs: number; observed: string[] }>;
  truncated: boolean;
};

const emptyBucket = (companyKey: string, date: string): DayBucketRow => ({
  companyKey,
  date,
  finished: 0,
  waited: 0,
  unfinished: 0,
  runsTotal: 0,
  actions: { read: 0, write: 0, external: 0, destructive: 0, total: 0 },
  perAgent: [],
  truncated: false,
});

/**
 * Fold one window of raw rows into day buckets, one per scope per day.
 *
 * `neededAPerson` is derived from the approvals rather than from run status,
 * because a run that parked and was then let through ends its life as an
 * ordinary success — the same reasoning the live query has always used.
 */
export function foldWindowIntoBuckets(input: {
  runs: RollupRunRow[];
  calls: RollupCallRow[];
  neededAPerson: Set<string>;
  agentsById: Map<string, AgentNameRow>;
  truncated: boolean;
}): DayBucketRow[] {
  const buckets = new Map<string, DayBucketRow>();

  const bucketFor = (companyKey: string, date: string) => {
    const key = `${companyKey}|${date}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = emptyBucket(companyKey, date);
      buckets.set(key, bucket);
    }
    return bucket;
  };

  const agentSlot = (bucket: DayBucketRow, agentId: string) => {
    let slot = bucket.perAgent.find((entry) => entry.agentId === agentId);
    if (!slot) {
      const agent = input.agentsById.get(agentId);
      slot = {
        agentId,
        name: agent?.name ?? "Unknown system",
        risk: agent?.risk ?? "UNRATED",
        runs: 0,
        observed: [],
      };
      bucket.perAgent.push(slot);
    }
    return slot;
  };

  for (const run of input.runs) {
    const bucket = bucketFor(companyKeyOf(run.companyId), dayKey(run.startedAt));
    bucket.runsTotal += 1;
    if (input.neededAPerson.has(run.id)) bucket.waited += 1;
    if (run.status === "FAILED" || run.status === "CANCELLED") bucket.unfinished += 1;
    else if (run.status === "SUCCESS") bucket.finished += 1;
    agentSlot(bucket, run.agentId).runs += 1;
  }

  for (const call of input.calls) {
    const bucket = bucketFor(companyKeyOf(call.companyId), dayKey(call.startedAt));
    const level = call.sideEffectLevel;
    if (!level) continue;
    bucket.actions.total += 1;
    if (level === "READ") bucket.actions.read += 1;
    else if (level === "WRITE") bucket.actions.write += 1;
    else if (level === "EXTERNAL") bucket.actions.external += 1;
    else if (level === "DESTRUCTIVE") bucket.actions.destructive += 1;

    const slot = agentSlot(bucket, call.agentId);
    if (!slot.observed.includes(level)) slot.observed.push(level);
  }

  for (const bucket of buckets.values()) bucket.truncated = input.truncated;

  return [...buckets.values()];
}

/** Every UTC day key in the window, oldest first — the timeline's spine. */
export function dayKeysBack(now: number, days: number): string[] {
  const keys: string[] = [];
  for (let back = days - 1; back >= 0; back -= 1) {
    keys.push(dayKey(now - back * DAY_MS));
  }
  return keys;
}

export type MergedActivity = {
  timeline: Array<{ date: string; finished: number; waited: number; unfinished: number }>;
  runsTotal: number;
  unfinished: number;
  actions: SideEffectSummary;
  busiest: Array<{ id: string; name: string; risk: string; runs: number }>;
  truncated: boolean;
};

/**
 * Bucket rows in, the activity screen's figures out.
 *
 * The screen's shapes, unchanged: this is the half of the old query that
 * summed raw rows, now summing bucket rows instead.
 */
export function mergeBucketsForWindow(
  buckets: DayBucketRow[],
  now: number,
  days: number,
  busiestLimit = 5,
): MergedActivity {
  const byDate = new Map<string, { finished: number; waited: number; unfinished: number }>();
  const actions = { read: 0, write: 0, external: 0, destructive: 0, total: 0 };
  const byAgent = new Map<string, { id: string; name: string; risk: string; runs: number; namedOn: string }>();
  let runsTotal = 0;
  let unfinished = 0;
  let truncated = false;

  for (const bucket of buckets) {
    const day = byDate.get(bucket.date) ?? { finished: 0, waited: 0, unfinished: 0 };
    day.finished += bucket.finished;
    day.waited += bucket.waited;
    day.unfinished += bucket.unfinished;
    byDate.set(bucket.date, day);

    runsTotal += bucket.runsTotal;
    unfinished += bucket.unfinished;
    actions.read += bucket.actions.read;
    actions.write += bucket.actions.write;
    actions.external += bucket.actions.external;
    actions.destructive += bucket.actions.destructive;
    actions.total += bucket.actions.total;
    if (bucket.truncated) truncated = true;

    for (const entry of bucket.perAgent) {
      const agent = byAgent.get(entry.agentId) ?? {
        id: entry.agentId,
        name: entry.name,
        risk: entry.risk,
        runs: 0,
        namedOn: bucket.date,
      };
      agent.runs += entry.runs;
      // The freshest bucket wins the name and rating — an agent renamed
      // mid-window should read as it reads today. Judged by the bucket's date,
      // not by iteration order: the rows arrive however the index returns them.
      if (bucket.date >= agent.namedOn) {
        agent.name = entry.name;
        agent.risk = entry.risk;
        agent.namedOn = bucket.date;
      }
      byAgent.set(entry.agentId, agent);
    }
  }

  return {
    timeline: dayKeysBack(now, days).map((date) => ({
      date,
      ...(byDate.get(date) ?? { finished: 0, waited: 0, unfinished: 0 }),
    })),
    runsTotal,
    unfinished,
    actions: {
      ...actions,
      readShare: actions.total === 0 ? 0 : Math.round((actions.read / actions.total) * 100),
    },
    busiest: [...byAgent.values()]
      .filter((agent) => agent.runs > 0)
      .sort((a, b) => b.runs - a.runs)
      .slice(0, busiestLimit)
      .map(({ namedOn: _namedOn, ...agent }) => agent),
    truncated,
  };
}

export type EstateRollupRow = {
  companyKey: string;
  systems: number;
  riskMix: RiskMix;
  unrated: number;
  incomplete: number;
  publicFacing: number;
  unattendedHighRisk: number;
  conformance: ConformanceFinding[];
  isPartial: boolean;
};

/**
 * Register entries in, one estate row per scope out.
 *
 * `observedByAgent` carries what each assistant actually did recently — folded
 * from the day buckets, so conformance survives the purge of the raw calls.
 */
export function foldEstateRows(input: {
  entries: Array<AiSystemEntry & { companyId?: string }>;
  agents: Array<{ id: string; companyId?: string; name: string; riskLevel?: string }>;
  observedByAgent: Map<string, SideEffectLevel[]>;
  isPartial: boolean;
}): EstateRollupRow[] {
  const keys = new Set<string>([
    ...input.entries.map((entry) => companyKeyOf(entry.companyId)),
    ...input.agents.map((agent) => companyKeyOf(agent.companyId)),
  ]);

  const rows: EstateRollupRow[] = [];
  for (const key of keys) {
    const entries = input.entries.filter((entry) => companyKeyOf(entry.companyId) === key);
    const summary = summariseRegister(entries);

    const conformance: ConformanceFinding[] = [];
    for (const agent of input.agents.filter((agent) => companyKeyOf(agent.companyId) === key)) {
      const finding = checkConformance({
        agentId: agent.id,
        agentName: agent.name,
        rating: agent.riskLevel as never,
        observed: input.observedByAgent.get(agent.id) ?? [],
      });
      if (finding) conformance.push(finding);
    }

    rows.push({
      companyKey: key,
      systems: entries.length,
      riskMix: countRiskMix(entries.map((entry) => entry.risk)),
      unrated: summary.unrated,
      incomplete: summary.incomplete,
      publicFacing: summary.publicFacing,
      unattendedHighRisk: entries.filter((entry) => entry.risk === "HIGH" && !entry.humanApproves).length,
      conformance,
      isPartial: input.isPartial,
    });
  }

  return rows;
}

/** Estate rows in, one scope's merged view out — every field adds or concatenates. */
export function mergeEstateRows(rows: EstateRollupRow[]): EstateRollupRow {
  const merged: EstateRollupRow = {
    companyKey: "merged",
    systems: 0,
    riskMix: { high: 0, medium: 0, low: 0, unrated: 0 },
    unrated: 0,
    incomplete: 0,
    publicFacing: 0,
    unattendedHighRisk: 0,
    conformance: [],
    isPartial: false,
  };

  for (const row of rows) {
    merged.systems += row.systems;
    merged.riskMix.high += row.riskMix.high;
    merged.riskMix.medium += row.riskMix.medium;
    merged.riskMix.low += row.riskMix.low;
    merged.riskMix.unrated += row.riskMix.unrated;
    merged.unrated += row.unrated;
    merged.incomplete += row.incomplete;
    merged.publicFacing += row.publicFacing;
    merged.unattendedHighRisk += row.unattendedHighRisk;
    merged.conformance.push(...row.conformance);
    if (row.isPartial) merged.isPartial = true;
  }

  return merged;
}
