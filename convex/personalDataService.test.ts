import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  PERSONAL_DATA_INDEXES,
  PERSONAL_DATA_RULES,
  describeErasure,
  indexFor,
  ruleFor,
  rulesFor,
  type ErasureTally,
} from "./personalDataService";

/**
 * Reads the schema rather than a hand-written list.
 *
 * An erasure you cannot prove is complete is not worth much, and the way it
 * stops being complete is that somebody adds a table next year and nobody
 * remembers this file exists. So the schema is the source of truth and the
 * manifest is checked against it.
 */
function schemaSource() {
  return ["schema.ts", "billingSchema.ts", "uploadSchema.ts"].map(file => fs.readFileSync(path.join(process.cwd(), "convex", file), "utf8")).join("\n");
}

function tablesReferencingUsers(): Map<string, string[]> {
  const source = schemaSource();
  const tables = source.matchAll(/^ {2}(\w+): defineTable\(\{([\s\S]*?)^ {2}\}\)/gm);
  const found = new Map<string, string[]>();

  for (const [, name, body] of tables) {
    const fields = [...body.matchAll(/(\w+): v\.(?:optional\(v\.)?id\("users"\)/g)].map((m) => m[1]);
    if (fields.length > 0) found.set(name, [...new Set(fields)]);
  }

  return found;
}

/** Every index in the schema, as "table.leadingField" to the index's name. */
function indexesLeadingWith(): Map<string, string> {
  const source = schemaSource();
  const found = new Map<string, string>();

  for (const [, table, body] of source.matchAll(/^ {2}(\w+): defineTable\(([\s\S]*?)(?=^ {2}\w+: defineTable\(|\Z)/gm)) {
    for (const [, name, columns] of body.matchAll(/\.index\("(\w+)",\s*\[([^\]]+)\]/g)) {
      const leading = columns.match(/"(\w+)"/)?.[1];
      if (leading) found.set(`${table}.${leading}`, name);
    }
  }

  return found;
}

describe("the search knows which indexes it can actually use", () => {
  const schemaIndexes = indexesLeadingWith();

  test("the schema is actually being read", () => {
    expect(schemaIndexes.size).toBeGreaterThan(50);
  });

  test("every index it claims exists, and leads with the field it searches by", () => {
    // A renamed index would otherwise make the search quietly fall back to
    // reading the whole table — the thing that was crashing the screen — and
    // nothing would say so until it failed in front of somebody answering a
    // legal request.
    const wrong = Object.entries(PERSONAL_DATA_INDEXES).filter(
      ([pair, name]) => schemaIndexes.get(pair) !== name,
    );

    expect(wrong, `These no longer match the schema: ${wrong.map(([pair]) => pair).join(", ")}`).toEqual(
      [],
    );
  });

  test("a table with no usable index says so rather than guessing a name", () => {
    expect(indexFor("agentToolCalls", "userId")).toBeUndefined();
    expect(indexFor("messages", "userId")).toBe("by_user_role_created");
  });
});

describe("every place a person's data can be is classified", () => {
  const schemaTables = tablesReferencingUsers();

  test("the schema is actually being read", () => {
    // If this drops to nothing the checks below pass vacuously, which is the
    // one way this file could lie.
    expect(schemaTables.size).toBeGreaterThan(40);
  });

  test("no table holding a link to a person is unclassified", () => {
    const unclassified = [...schemaTables.keys()].filter((table) => !ruleFor(table));

    expect(unclassified, `Add these to PERSONAL_DATA_RULES: ${unclassified.join(", ")}`).toEqual([]);
  });

  test("no field pointing at a person is unaccounted for", () => {
    const missing: string[] = [];

    for (const [table, fields] of schemaTables) {
      const covered = PERSONAL_DATA_RULES.filter((rule) => rule.table === table).flatMap((r) => r.fields);
      for (const field of fields) {
        if (!covered.includes(field)) missing.push(`${table}.${field}`);
      }
    }

    expect(missing, `Unclassified user fields: ${missing.join(", ")}`).toEqual([]);
  });

  test("the manifest names no table the schema does not have", () => {
    const ghosts = PERSONAL_DATA_RULES.map((rule) => rule.table)
      .filter((table) => table !== "users")
      .filter((table) => !schemaTables.has(table));

    expect(ghosts, `Stale entries in PERSONAL_DATA_RULES: ${ghosts.join(", ")}`).toEqual([]);
  });

  test("every rule says why, because a treatment without a reason cannot be argued with", () => {
    for (const rule of PERSONAL_DATA_RULES) {
      expect(rule.reason.length, `${rule.table} has no reason`).toBeGreaterThan(10);
    }
  });
});

describe("the treatments are the ones a regulator would expect", () => {
  test("a person's conversations are deleted, not merely unlinked", () => {
    expect(ruleFor("messages")?.treatment).toBe("ERASE");
    expect(ruleFor("threads")?.treatment).toBe("ERASE");
    expect(ruleFor("logins")?.treatment).toBe("ERASE");
  });

  // template:remove:start movement
  test("a recording of someone's body is deleted", () => {
    expect(ruleFor("movements")?.treatment).toBe("ERASE");
    expect(ruleFor("movementDebugSessions")?.treatment).toBe("ERASE");
  });
  // template:remove:end

  test("a company's rules survive the person who wrote them leaving", () => {
    // Destroying a workspace's configuration is not what erasure asks for.
    expect(ruleFor("aiRules")?.treatment).toBe("DISSOCIATE");
    expect(ruleFor("workflows")?.treatment).toBe("DISSOCIATE");
    expect(ruleFor("knowledgeDocuments")?.treatment).toBe("DISSOCIATE");
  });

  test("the audit trail is kept, and says why", () => {
    const rule = ruleFor("auditLogs");

    expect(rule?.treatment).toBe("RETAIN");
    expect(rule?.reason).toContain("defeat the obligation");
  });

  test("who approved an AI action is kept, because an unsigned approval proves nothing", () => {
    expect(ruleFor("agentRunApprovals")?.treatment).toBe("RETAIN");
  });

  test("only four things are retained, so the exceptions stay reviewable", () => {
    expect(rulesFor("RETAIN").map((rule) => rule.table).sort()).toEqual([
      "agentRunApprovals",
      "auditLogs",
      "maintenanceScriptRuns",
      "purgeHistory",
    ]);
  });
});

describe("what the person answering the request is handed", () => {
  const tally = (table: string, treatment: ErasureTally["treatment"], rows: number): ErasureTally => ({
    table,
    treatment,
    rows,
  });

  test("says what was deleted and what merely lost a name", () => {
    const lines = describeErasure([
      tally("messages", "ERASE", 12),
      tally("threads", "ERASE", 3),
      tally("aiRules", "DISSOCIATE", 2),
    ]);

    expect(lines[0]).toBe("Deleted 15 records held about this person.");
    expect(lines[1]).toBe("Removed their name from 2 shared records, which were kept.");
  });

  test("names every exception, because a silent one is what causes trouble", () => {
    const lines = describeErasure([]);

    expect(lines.filter((line) => line.startsWith("Kept:"))).toHaveLength(4);
  });

  test("says plainly when there was nothing to delete", () => {
    expect(describeErasure([])[0]).toBe("Nothing held only about this person was found.");
  });

  test("singulars read properly, because this goes to a regulator", () => {
    expect(describeErasure([tally("messages", "ERASE", 1)])[0]).toBe(
      "Deleted 1 record held about this person."
    );
  });

  test("a table with nothing in it is not mentioned", () => {
    const lines = describeErasure([tally("messages", "ERASE", 4), tally("aiRules", "DISSOCIATE", 0)]);

    expect(lines.some((line) => line.includes("shared record"))).toBe(false);
  });
});
