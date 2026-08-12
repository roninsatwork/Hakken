import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { UNREAD_COUNT_LIMIT } from "./notifications";

/**
 * A notification belongs to one person. The thing most worth proving is that
 * read state is theirs alone — two colleagues in the same workspace have
 * separate inboxes, and marking your own copy read must never clear theirs.
 */

async function seedColleagues() {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));

  const ids = await t.run(async (ctx) => {
    const company = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
    const me = await ctx.db.insert("users", {
      email: "me@test.com",
      role: "ADMIN",
      companyId: company,
      createdAt: Date.now(),
    });
    const colleague = await ctx.db.insert("users", {
      email: "colleague@test.com",
      role: "USER",
      companyId: company,
      createdAt: Date.now(),
    });
    return { company, me, colleague };
  });

  return { t, ...ids };
}

const PAGE = { numItems: 20, cursor: null };

describe("notifications", () => {
  test("you see only your own", async () => {
    const { t, company, me, colleague } = await seedColleagues();

    await t.mutation(internal.notifications.notifyUserInternal, {
      userId: me,
      companyId: company,
      kind: "TASK_ASSIGNED",
      title: "Contact Tesco Watford",
    });
    await t.mutation(internal.notifications.notifyUserInternal, {
      userId: colleague,
      companyId: company,
      kind: "TASK_ASSIGNED",
      title: "Not for you",
    });

    const mine = await t.withIdentity({ subject: me }).query(api.notifications.listMine, { paginationOpts: PAGE });
    expect(mine.page.map((row) => row.title)).toEqual(["Contact Tesco Watford"]);
  });

  test("marking read is per person and leaves a colleague's copy alone", async () => {
    const { t, company, me, colleague } = await seedColleagues();

    const mineId = await t.mutation(internal.notifications.notifyUserInternal, {
      userId: me,
      companyId: company,
      kind: "APPROVAL_WAITING",
      title: "An approval is waiting",
    });
    await t.mutation(internal.notifications.notifyUserInternal, {
      userId: colleague,
      companyId: company,
      kind: "APPROVAL_WAITING",
      title: "An approval is waiting",
    });

    await t.withIdentity({ subject: me }).mutation(api.notifications.markRead, { notificationId: mineId });

    const theirCount = await t.withIdentity({ subject: colleague }).query(api.notifications.countMineUnread, {});
    expect(theirCount.count).toBe(1);

    const myCount = await t.withIdentity({ subject: me }).query(api.notifications.countMineUnread, {});
    expect(myCount.count).toBe(0);
  });

  test("you cannot mark somebody else's notification read", async () => {
    const { t, company, me, colleague } = await seedColleagues();

    const theirs = await t.mutation(internal.notifications.notifyUserInternal, {
      userId: colleague,
      companyId: company,
      kind: "TASK_ASSIGNED",
      title: "Theirs",
    });

    await expect(
      t.withIdentity({ subject: me }).mutation(api.notifications.markRead, { notificationId: theirs }),
    ).rejects.toThrow("could not be found");
  });

  test("the unread count ignores what has been read", async () => {
    const { t, company, me } = await seedColleagues();

    const first = await t.mutation(internal.notifications.notifyUserInternal, {
      userId: me,
      companyId: company,
      kind: "AGENT_RUN_FAILED",
      title: "A run failed",
    });
    await t.mutation(internal.notifications.notifyUserInternal, {
      userId: me,
      companyId: company,
      kind: "AGENT_RUN_FAILED",
      title: "Another run failed",
    });

    const asMe = t.withIdentity({ subject: me });
    expect((await asMe.query(api.notifications.countMineUnread, {})).count).toBe(2);

    await asMe.mutation(api.notifications.markRead, { notificationId: first });
    expect((await asMe.query(api.notifications.countMineUnread, {})).count).toBe(1);
  });

  test("nothing waiting reads as zero, so the badge can be absent", async () => {
    const { t, me } = await seedColleagues();

    const count = await t.withIdentity({ subject: me }).query(api.notifications.countMineUnread, {});
    expect(count).toEqual({ count: 0, atLimit: false });
  });

  test("a very full inbox reports the limit rather than counting forever", async () => {
    const { t, company, me } = await seedColleagues();

    for (let index = 0; index < UNREAD_COUNT_LIMIT + 5; index += 1) {
      await t.mutation(internal.notifications.notifyUserInternal, {
        userId: me,
        companyId: company,
        kind: "TASK_ASSIGNED",
        title: `Task ${index}`,
      });
    }

    const count = await t.withIdentity({ subject: me }).query(api.notifications.countMineUnread, {});
    expect(count).toEqual({ count: UNREAD_COUNT_LIMIT, atLimit: true });
  });

  test("marking all read clears the badge in one press", async () => {
    const { t, company, me } = await seedColleagues();

    for (let index = 0; index < 3; index += 1) {
      await t.mutation(internal.notifications.notifyUserInternal, {
        userId: me,
        companyId: company,
        kind: "TASK_ASSIGNED",
        title: `Task ${index}`,
      });
    }

    const asMe = t.withIdentity({ subject: me });
    const cleared = await asMe.mutation(api.notifications.markAllMineRead, {});
    expect(cleared).toBe(3);
    expect((await asMe.query(api.notifications.countMineUnread, {})).count).toBe(0);
  });

  test("a notification with no title is refused rather than shown blank", async () => {
    const { t, company, me } = await seedColleagues();

    await expect(
      t.mutation(internal.notifications.notifyUserInternal, {
        userId: me,
        companyId: company,
        kind: "TASK_ASSIGNED",
        title: "   ",
      }),
    ).rejects.toThrow("needs a title");
  });
});
