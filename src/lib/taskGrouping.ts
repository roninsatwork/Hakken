/**
 * Grouping tasks by when they are due.
 *
 * A flat list of to-dos does not answer the only question anyone asks of one,
 * which is "what needs me today". Overdue first, then today, then the rest of
 * the week, then everything else — and finished work last, because it is a
 * record rather than a queue.
 *
 * Pure so the boundaries can be tested without a clock. Days are calendar
 * days in the viewer's own timezone: something due at 23:50 tonight is due
 * today, not "in eleven hours".
 */

export type TaskGroup = "overdue" | "today" | "week" | "later" | "done" | "cancelled";

export const TASK_GROUP_ORDER: readonly TaskGroup[] = [
  "overdue",
  "today",
  "week",
  "later",
  "done",
  "cancelled",
];

function startOfDay(ms: number) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function getTaskGroup(
  task: { status: "OPEN" | "DONE" | "CANCELLED"; dueAt?: number },
  now: number,
): TaskGroup {
  if (task.status === "DONE") return "done";
  if (task.status === "CANCELLED") return "cancelled";

  // An open task with no date is never overdue and never urgent; it waits
  // with everything else rather than being invented into today.
  if (task.dueAt === undefined) return "later";

  const today = startOfDay(now);
  if (task.dueAt < today) return "overdue";

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (task.dueAt < tomorrow.getTime()) return "today";

  const endOfWeek = new Date(today);
  endOfWeek.setDate(endOfWeek.getDate() + 7);
  if (task.dueAt < endOfWeek.getTime()) return "week";

  return "later";
}

export type GroupedTasks<T> = Array<{ group: TaskGroup; tasks: T[] }>;

/** Split an ordered list into due-date groups, dropping the empty ones. */
export function groupTasks<T extends { status: "OPEN" | "DONE" | "CANCELLED"; dueAt?: number }>(
  tasks: T[],
  now: number,
): GroupedTasks<T> {
  const groups = new Map<TaskGroup, T[]>();

  for (const task of tasks) {
    const group = getTaskGroup(task, now);
    const existing = groups.get(group);
    if (existing) existing.push(task);
    else groups.set(group, [task]);
  }

  return TASK_GROUP_ORDER.filter((group) => groups.has(group)).map((group) => ({
    group,
    tasks: groups.get(group) as T[],
  }));
}

/** The date shown on a row, or null when the task has no date at all. */
export function formatTaskDue(dueAt: number | undefined, locale?: string | string[]) {
  if (dueAt === undefined) return null;
  return new Intl.DateTimeFormat(locale ?? [], { day: "numeric", month: "short" }).format(new Date(dueAt));
}
