import { getFunctionName } from "convex/server";

/**
 * The header the site's screens all read, as a test row, and a way to answer
 * `useQuery` by function name.
 */

export function convexPath(reference: unknown): string {
  try {
    return getFunctionName(reference as never);
  } catch {
    const maybe = reference as { _path?: unknown };
    return typeof maybe._path === "string" ? maybe._path : "";
  }
}

const WEEKLY = JSON.stringify({
  version: 2, kind: "recurring", cadence: "weekly", dayOfWeek: 1, timeLocal: "09:00", timezone: "UTC",
});

export const ownedHeader = {
  companyWebsiteId: "companyWebsite_1",
  companyId: "company_1",
  companyName: "Test Agency",
  websiteId: "website_9",
  displayHost: "ourshop.com",
  relationship: "OWNED" as const,
  pairedWith: null,
  placeLabel: "Leeds, England",
  schedule: { active: true, intervalStr: WEEKLY, nextRunAt: Date.parse("2026-09-28T09:00:00Z"), source: "COMPANY" as const },
  counts: { searches: 3, questions: 1, rivals: 1, brandNames: 2 },
  monthly: { site: 0.1, searches: 0.26, questions: null, rivals: 0.1, total: null },
  lastCollectedAt: Date.parse("2026-09-21T09:00:00Z"),
};

export const trackedHeader = {
  ...ownedHeader,
  companyWebsiteId: "companyWebsite_2",
  websiteId: "website_10",
  displayHost: "rival.com",
  relationship: "TRACKED" as const,
  pairedWith: { companyWebsiteId: "companyWebsite_1", displayHost: "ourshop.com" },
  counts: { searches: 0, questions: 0, rivals: 0, brandNames: 1 },
  schedule: { ...ownedHeader.schedule, source: "PAIR" as const },
};

/** Answer each query by the end of its function name. */
export function answerQueries(answers: Record<string, unknown>) {
  return ((reference: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    const name = convexPath(reference);
    const match = Object.keys(answers).find((suffix) => name.endsWith(suffix));
    return match ? answers[match] : undefined;
  }) as never;
}
