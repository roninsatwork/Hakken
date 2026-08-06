import { describe, expect, test } from "vitest";
import {
  EXPECTED_RETENTION_DAYS,
  STALE_APPROVAL_DAYS,
  assessRetention,
  countCheck,
  countStaleApprovals,
  daysBetween,
  orderChecks,
  summariseDashboard,
  type GovernanceCheck,
} from "./governanceDashboardService";

const DAY = 24 * 60 * 60 * 1000;

describe("a count where zero is the good answer", () => {
  test("something to do needs attention", () => {
    expect(countCheck("unrated", 3, "/x").state).toBe("NEEDS_ATTENTION");
  });

  test("nothing to do settles rather than disappearing", () => {
    // An absent row and a row reading nought are different claims, and only one
    // of them says a check actually ran.
    const check = countCheck("unrated", 0, "/x");

    expect(check.state).toBe("SETTLED");
    expect(check.count).toBe(0);
  });

  test("every check says where to go and look", () => {
    expect(countCheck("unrated", 0, "/admin/governance/register").href).toBe(
      "/admin/governance/register"
    );
  });
});

describe("an approval that stopped being oversight", () => {
  const now = 100 * DAY;

  test("a week of silence counts as stale", () => {
    expect(countStaleApprovals([now - STALE_APPROVAL_DAYS * DAY], now)).toBe(1);
  });

  test("something asked yesterday does not", () => {
    expect(countStaleApprovals([now - DAY], now)).toBe(0);
  });

  test("counts only the ones that have waited", () => {
    expect(countStaleApprovals([now - DAY, now - 30 * DAY, now - 90 * DAY], now)).toBe(2);
  });

  test("an empty queue is not stale", () => {
    expect(countStaleApprovals([], now)).toBe(0);
  });

  test("days are whole days, not part ones", () => {
    expect(daysBetween(now - DAY * 2.9, now)).toBe(2);
  });
});

describe("retention, judged against what is expected", () => {
  const pipeline = (key: string, enabled: boolean, retentionDays: number) => ({
    key,
    enabled,
    retentionDays,
  });

  test("nothing switched on is not a problem, it is a setting nobody has made", () => {
    // Keeping everything forever breaks no obligation, and shouting about it
    // would be crying wolf.
    expect(assessRetention([pipeline("auditLogs", false, 90)]).state).toBe("NOT_SET_UP");
  });

  test("purging below six months is the actual finding", () => {
    // This one silently destroys records someone is expected to still have.
    const result = assessRetention([pipeline("auditLogs", true, 90)]);

    expect(result.state).toBe("NEEDS_ATTENTION");
    expect(result.tooShort).toEqual(["auditLogs"]);
  });

  test("six months exactly is enough", () => {
    expect(assessRetention([pipeline("auditLogs", true, EXPECTED_RETENTION_DAYS)]).state).toBe(
      "SETTLED"
    );
  });

  test("names every pipeline that is too short, not just the first", () => {
    expect(
      assessRetention([
        pipeline("auditLogs", true, 30),
        pipeline("chatHistory", true, 365),
        pipeline("agentLogs", true, 90),
      ]).tooShort
    ).toEqual(["auditLogs", "agentLogs"]);
  });

  test("a pipeline that is off is not judged, however short it is set", () => {
    expect(assessRetention([pipeline("auditLogs", false, 1), pipeline("agentLogs", true, 365)]).tooShort).toEqual(
      []
    );
  });
});

describe("what a reader is shown first", () => {
  const check = (key: string): GovernanceCheck => ({ key, state: "SETTLED", count: 0, href: "/x" });

  test("an unclassified estate comes before everything else", () => {
    // Until something is rated, nothing else on the screen means very much.
    const ordered = orderChecks([check("retention"), check("publicFacing"), check("unrated")]);

    expect(ordered[0].key).toBe("unrated");
  });

  test("the order is what an auditor asks about, not what is biggest", () => {
    const ordered = orderChecks([
      check("retention"),
      check("staleApprovals"),
      check("incomplete"),
      check("unrated"),
    ]);

    expect(ordered.map((c) => c.key)).toEqual([
      "unrated",
      "incomplete",
      "staleApprovals",
      "retention",
    ]);
  });
});

describe("the line at the top", () => {
  test("counts how many things need a person", () => {
    const summary = summariseDashboard([
      { key: "a", state: "NEEDS_ATTENTION", href: "/x" },
      { key: "b", state: "SETTLED", href: "/x" },
      { key: "c", state: "NEEDS_ATTENTION", href: "/x" },
    ]);

    expect(summary).toEqual({ attention: 2, state: "NEEDS_ATTENTION" });
  });

  test("nothing outstanding settles", () => {
    expect(summariseDashboard([{ key: "a", state: "SETTLED", href: "/x" }])).toEqual({
      attention: 0,
      state: "SETTLED",
    });
  });

  test("a check nobody has set up does not count as a problem", () => {
    expect(summariseDashboard([{ key: "retention", state: "NOT_SET_UP", href: "/x" }]).attention).toBe(0);
  });
});
