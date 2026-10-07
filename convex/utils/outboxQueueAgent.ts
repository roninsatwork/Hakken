/**
 * The Outbox Queue Processing Agent's definition (docs/plans/active/outbox-
 * and-preferences-plan.md, A2): the built-in agent that sends what waits in
 * the Outbox once an hour, oldest first, from the one Outbox address. It
 * takes over the Email Sender role (Anthony, 2026-10-07, who named it). Plain
 * code, free of any Convex function.
 */
export const OUTBOX_QUEUE_AGENT = {
  systemKey: "OUTBOX_QUEUE_PROCESSOR",
  name: "Outbox Queue Processing Agent",
  description:
    "Sends the emails waiting in the Outbox once an hour, oldest first, each in its reader's language and from the one Outbox address, and records each one sent, failed or skipped. Signing in and invitations never wait here: they go out at once. It calls no model.",
  systemPrompt: "You send the emails waiting in the Outbox. The platform does this as a fixed job: you write nothing, decide nothing and call no model.",
  standingObjective: "Send what waits in the Outbox, oldest first.",
} as const;

/** Its schedule, made with it: every hour, on the hour. Shown and changed on the Schedules screen. */
export const OUTBOX_SCHEDULE = {
  name: "Outbox: send what is waiting",
  intervalStr: JSON.stringify({ version: 2, kind: "recurring", cadence: "hourly", everyHours: 1, startTimeLocal: "00:00", timezone: "Europe/London" }),
} as const;

/** Waiting longer than this, the super admins are told in their bell (Anthony, 2026-10-07). */
export const OUTBOX_STUCK_MS = 2 * 60 * 60 * 1000;

/** Told at most this often while emails stay stuck. */
export const OUTBOX_STUCK_REMIND_MS = 24 * 60 * 60 * 1000;
