import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { USER_MEMORY_MAX_ACTIVE, parseNotes } from "./userMemories";
import { SELF_IMPROVEMENT_CONFIG_KEY } from "./selfImprovementConfig";

/**
 * The personal layer's ground rules (personal-layer-and-goals-plan.md,
 * part 2, Anthony's rulings 2026-08-21): only the person reads or edits
 * their own note; audit rows carry counts, never words; the sweep reads
 * only the subject's own non-widget threads and spends nothing while the
 * autonomy switch is off; erasure takes the note with the person.
 */

async function seedUser(t: ReturnType<typeof convexTest>, email: string) {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", { email, role: "USER", createdAt: Date.now() })
  );
}

async function seedNote(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  content: string
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("userMemories", {
      userId,
      content,
      normalizedContent: content.toLowerCase(),
      status: "APPROVED" as const,
      sourceType: "CHAT" as const,
      autoApplied: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      usageCount: 0,
    })
  );
}

describe("the person's own doors", () => {
  test("listMine shows only my rows, and deleteMine refuses another person's", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const me = await seedUser(t, "me@test.com");
    const them = await seedUser(t, "them@test.com");
    await seedNote(t, me, "Prefers short answers.");
    const theirNoteId = await seedNote(t, them, "Their private note.");

    const mine = await t.withIdentity({ subject: me }).query(api.userMemories.listMine, {});
    expect(mine.map((note) => note.content)).toEqual(["Prefers short answers."]);

    await expect(
      t.withIdentity({ subject: me }).mutation(api.userMemories.deleteMine, {
        memoryId: theirNoteId,
      })
    ).rejects.toThrow();
  });

  test("adding is capped, deduplicated, and audited without the words", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const me = await seedUser(t, "me@test.com");
    const asMe = t.withIdentity({ subject: me });

    await asMe.mutation(api.userMemories.addMine, { content: "Prefers short answers." });
    // The same words again change nothing.
    await asMe.mutation(api.userMemories.addMine, { content: "prefers short answers." });
    const mine = await asMe.query(api.userMemories.listMine, {});
    expect(mine).toHaveLength(1);

    // No audit row ever carries the note's content.
    const audits = await t.run(async (ctx) =>
      (await ctx.db.query("auditLogs").collect()).filter(
        (row) => row.entityType === "userMemories"
      )
    );
    expect(audits.length).toBeGreaterThan(0);
    for (const row of audits) {
      expect(row.metadata ?? "").not.toContain("short answers");
    }

    for (let i = mine.length; i < USER_MEMORY_MAX_ACTIVE; i++) {
      await asMe.mutation(api.userMemories.addMine, { content: `Note number ${i}.` });
    }
    await expect(
      asMe.mutation(api.userMemories.addMine, { content: "One too many." })
    ).rejects.toThrow();
  });

  test("deleting is immediate — the row goes, not to an archive", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const me = await seedUser(t, "me@test.com");
    const noteId = await seedNote(t, me, "Prefers short answers.");

    await t.withIdentity({ subject: me }).mutation(api.userMemories.deleteMine, {
      memoryId: noteId,
    });
    const row = await t.run(async (ctx) => ctx.db.get(noteId));
    expect(row).toBeNull();
  });
});

describe("the learning landing", () => {
  test("learned notes are capped, deduplicated, and marked as the AI's own work", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const me = await seedUser(t, "me@test.com");

    // Through the sweep's own landing — the only production write door.
    const result = await t.mutation(internal.userMemories.recordSweepInternal, {
      userId: me,
      sweptTo: Date.now(),
      messagesRead: 3,
      notes: ["Works in finance.", "works in finance.", "Cares about margins."],
    });
    expect(result.saved).toBe(2);

    const rows = await t.run(async (ctx) => ctx.db.query("userMemories").collect());
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.autoApplied === true)).toBe(true);
  });

  test("the sweep saves nothing while the autonomy switch is off", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const me = await seedUser(t, "me@test.com");
    await t.run(async (ctx) => {
      await ctx.db.insert("systemConfig", {
        key: SELF_IMPROVEMENT_CONFIG_KEY,
        value: JSON.stringify({ autonomousMemory: false }),
        updatedAt: Date.now(),
      });
    });

    const users = await t.query(internal.userMemories.listUsersToSweepInternal, {});
    expect(users).toEqual([]);

    const result = await t.mutation(internal.userMemories.recordSweepInternal, {
      userId: me,
      sweptTo: Date.now(),
      messagesRead: 3,
      notes: ["Works in finance."],
    });
    expect(result.saved).toBe(0);
    const rows = await t.run(async (ctx) => ctx.db.query("userMemories").collect());
    expect(rows).toHaveLength(0);
  });

  test("the sweep reads only the subject's own non-widget threads", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const me = await seedUser(t, "me@test.com");
    const them = await seedUser(t, "them@test.com");
    const now = Date.now();

    await t.run(async (ctx) => {
      const myThread = await ctx.db.insert("threads", {
        userId: me,
        title: "mine",
        createdAt: now,
        updatedAt: now,
      });
      const widgetId = await ctx.db.insert("widgets", {
        name: "Test widget",
        allowedDomains: [],
        isActive: true,
        createdAt: now,
      });
      const myWidgetThread = await ctx.db.insert("threads", {
        userId: me,
        widgetId,
        title: "widget",
        createdAt: now,
        updatedAt: now,
      });
      const theirThread = await ctx.db.insert("threads", {
        userId: them,
        title: "theirs",
        createdAt: now,
        updatedAt: now,
      });
      for (const [threadId, content] of [
        [myThread, "My own words."],
        [myWidgetThread, "Widget words."],
        [theirThread, "Someone else's words."],
      ] as const) {
        await ctx.db.insert("messages", {
          threadId,
          role: "user",
          content,
          createdAt: now,
        });
      }
    });

    const input = await t.query(internal.userMemories.getSweepInputInternal, {
      userId: me,
      since: 0,
    });
    expect(input.messages.map((message) => message.content)).toEqual(["My own words."]);
  });

  test("a full note is never read at all", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const me = await seedUser(t, "me@test.com");
    for (let i = 0; i < USER_MEMORY_MAX_ACTIVE; i++) {
      await seedNote(t, me, `Note number ${i}.`);
    }
    const input = await t.query(internal.userMemories.getSweepInputInternal, {
      userId: me,
      since: 0,
    });
    expect(input.isFull).toBe(true);
    expect(input.messages).toEqual([]);
  });
});

describe("reading the model's reply", () => {
  test("fenced JSON is tolerated; junk, blanks and excess are dropped", () => {
    expect(parseNotes('```json\n{"notes":["Keeps asking about Comax.", ""]}\n```')).toEqual([
      "Keeps asking about Comax.",
    ]);
    expect(parseNotes("not json at all")).toEqual([]);
    expect(
      parseNotes(JSON.stringify({ notes: ["a", "b", "c", "d", "e"] }))
    ).toHaveLength(3);
  });
});

describe("usage stamps and erasure", () => {
  test("marking used stamps count and time on approved rows only", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const me = await seedUser(t, "me@test.com");
    const noteId = await seedNote(t, me, "Prefers short answers.");

    await t.mutation(internal.userMemories.markUsedInternal, { memoryIds: [noteId] });
    const row = await t.run(async (ctx) => ctx.db.get(noteId));
    expect(row?.usageCount).toBe(1);
    expect(row?.lastUsedAt).toBeGreaterThan(0);
  });

  test("erasing a person takes their note and sweep marker with them", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const me = await seedUser(t, "me@test.com");
    await seedNote(t, me, "Prefers short answers.");
    await t.run(async (ctx) => {
      await ctx.db.insert("userMemorySweeps", {
        userId: me,
        lastSweptAt: Date.now(),
        lastRunAt: Date.now(),
        lastMessagesRead: 0,
        lastSuggested: 0,
        updatedAt: Date.now(),
      });
    });

    await t.mutation(internal.users.purgeUserEntitiesInternal, { userId: me });

    const { notes, sweeps } = await t.run(async (ctx) => ({
      notes: await ctx.db.query("userMemories").collect(),
      sweeps: await ctx.db.query("userMemorySweeps").collect(),
    }));
    expect(notes).toEqual([]);
    expect(sweeps).toEqual([]);
  });
});

describe("the subject access export honours the ruling", () => {
  test("an exported note row carries no words — existence only", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const me = await seedUser(t, "me@test.com");
    await seedNote(t, me, "Prefers short answers.");

    const page = await t.query(internal.personalData.collectPage, {
      table: "userMemories",
      field: "userId",
      userId: me,
      cursor: null,
    });
    expect(page.rows).toHaveLength(1);
    const exported = JSON.stringify(page.rows);
    expect(exported).not.toContain("Prefers short answers");
    expect(exported).toContain("REDACTED");
  });
});

describe("the sweep rota reaches everyone", () => {
  test("never-swept people go first; the most recently swept go last", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const sweptRecently = await seedUser(t, "recent@test.com");
    const neverSwept = await seedUser(t, "never@test.com");
    await t.run(async (ctx) => {
      await ctx.db.insert("userMemorySweeps", {
        userId: sweptRecently,
        lastSweptAt: Date.now(),
        lastRunAt: Date.now(),
        lastMessagesRead: 0,
        lastSuggested: 0,
        updatedAt: Date.now(),
      });
    });

    const roster = await t.query(internal.userMemories.listUsersToSweepInternal, {});
    expect(roster[0].userId).toBe(neverSwept);
    expect(roster[roster.length - 1].userId).toBe(sweptRecently);
  });
});

describe("who may carry a personal note", () => {
  test("a signed-in person's own thread only — never widgets, never evals", async () => {
    const { shouldInjectPersonalNote } = await import("./aiPromptAssembly");
    const userId = "user_1";
    // The one shape that qualifies.
    expect(shouldInjectPersonalNote({ userId })).toBe(true);
    // A widget thread is a visitor surface, whatever ids it carries.
    expect(shouldInjectPersonalNote({ userId, widgetId: "widget_1" })).toBe(false);
    // An eval thread holds the running admin's id as plumbing, not an asker.
    expect(shouldInjectPersonalNote({ userId, purpose: "EVAL" })).toBe(false);
    // No signed-in person, nothing to inject.
    expect(shouldInjectPersonalNote({})).toBe(false);
    expect(shouldInjectPersonalNote(null)).toBe(false);
  });
});
