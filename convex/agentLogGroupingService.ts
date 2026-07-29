/**
 * Turning a flat stream of log entries into the jobs they belonged to.
 *
 * A job is a chain — think, call a tool, read the result, think again — and the
 * raw log presented it as unrelated rows in time order, interleaved with every
 * other job the agent had run. Now that entries record their run, they can be
 * read the way they happened.
 *
 * Kept out of `agentLogs.ts` so the grouping and the filter classification can
 * be tested directly rather than through a query.
 */

export type LogEntryLike = {
  _id: string;
  runId?: string;
  interactionType: string;
  outcome?: string;
  failureKey?: string;
  createdAt: number;
};

/** The four things a reader filters for, in their own words. */
export type LogFilter = "ALL" | "THINKING" | "TOOLS" | "PROBLEMS";

export type LogCategory = "THINKING" | "TOOL" | "PROBLEM" | "OTHER";

/**
 * What kind of entry this is.
 *
 * A failure is a problem whatever it was doing at the time: somebody filtering
 * for problems wants the failed tool call, not a tidy taxonomy.
 */
export function classifyLogEntry(entry: Pick<LogEntryLike, "interactionType" | "outcome">): LogCategory {
  if (entry.outcome === "FAILED") return "PROBLEM";

  const type = entry.interactionType.toUpperCase();
  if (type.startsWith("TOOL DISPATCH") || type.startsWith("TOOL AWAITING APPROVAL")) return "TOOL";
  if (type === "LLM SYNTHESIS" || type === "SYSTEM INSTRUCTION" || type === "WORKFLOW_EXECUTION") {
    return "THINKING";
  }
  return "OTHER";
}

export function matchesLogFilter(entry: Pick<LogEntryLike, "interactionType" | "outcome">, filter: LogFilter): boolean {
  if (filter === "ALL") return true;
  const category = classifyLogEntry(entry);
  if (filter === "THINKING") return category === "THINKING";
  if (filter === "TOOLS") return category === "TOOL";
  return category === "PROBLEM";
}

export type LogGroup<TEntry extends LogEntryLike> = {
  /** Absent for entries written outside any durable job. */
  runId?: string;
  entries: TEntry[];
  startedAt: number;
  lastAt: number;
};

/**
 * One group per job, newest job first, entries within a job in the order they
 * happened.
 *
 * Entries with no job of their own are not merged into one bucket: they were
 * written by separate pieces of work — a workflow step, a scheduled report —
 * and lumping them together would invent a job that never existed.
 */
export function groupLogsByRun<TEntry extends LogEntryLike>(entries: ReadonlyArray<TEntry>): LogGroup<TEntry>[] {
  const byRun = new Map<string, LogGroup<TEntry>>();
  const unlinked: LogGroup<TEntry>[] = [];

  for (const entry of entries) {
    if (!entry.runId) {
      unlinked.push({
        entries: [entry],
        startedAt: entry.createdAt,
        lastAt: entry.createdAt,
      });
      continue;
    }

    const existing = byRun.get(entry.runId);
    if (existing) {
      existing.entries.push(entry);
      existing.startedAt = Math.min(existing.startedAt, entry.createdAt);
      existing.lastAt = Math.max(existing.lastAt, entry.createdAt);
    } else {
      byRun.set(entry.runId, {
        runId: entry.runId,
        entries: [entry],
        startedAt: entry.createdAt,
        lastAt: entry.createdAt,
      });
    }
  }

  const groups = [...byRun.values(), ...unlinked];
  for (const group of groups) {
    group.entries.sort((left, right) => left.createdAt - right.createdAt);
  }

  return groups.sort((left, right) => right.lastAt - left.lastAt);
}

/**
 * How many times each failure has happened across the window.
 *
 * A reader looking at one red row needs to know whether it is a one-off or the
 * forty-second time today, and that difference is what decides whether they act.
 */
export function countFailureKeys(entries: ReadonlyArray<LogEntryLike>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    if (entry.outcome !== "FAILED" || !entry.failureKey) continue;
    counts[entry.failureKey] = (counts[entry.failureKey] ?? 0) + 1;
  }
  return counts;
}
