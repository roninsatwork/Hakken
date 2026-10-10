import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { MAX_TOPICS, keyFromName } from "./topics";

/**
 * Topics (docs/plans/active/insights-helpful-content-plan.md, IH20): one list
 * Knowledge, Helpful content and Who to follow share, managed by the super
 * admin alone, read by every signed-in user in their language, kept by key so
 * a rename changes nothing that uses it, and deleted only by taking it off
 * everything that did.
 */

function harness() {
  return convexTest(schema, import.meta.glob("./**/*.*s"));
}

async function people(t: ReturnType<typeof harness>) {
  const { superAdminId, memberId } = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Korda", createdAt: Date.now() });
    const superAdminId = await ctx.db.insert("users", { email: "admin@hakken.example", role: "SUPER_ADMIN" });
    const memberId = await ctx.db.insert("users", { email: "member@korda.example", role: "USER", companyId });
    return { superAdminId, memberId };
  });
  return { superAdmin: t.withIdentity({ subject: superAdminId }), member: t.withIdentity({ subject: memberId }) };
}

describe("Topics", () => {
  // A save schedules its translation; on fake timers it runs only when a test asks, never after the test.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("the first topics arrive once, under their old keys, with the Italian readers already had", async () => {
    const t = harness();
    const { member } = await people(t);

    expect(await t.mutation(internal.topics.seedFirstTopicsInternal, {})).toBe(4);
    expect(await t.mutation(internal.topics.seedFirstTopicsInternal, {})).toBe(0);

    expect(await member.query(api.topics.listTopics, { language: "en" })).toEqual([
      { key: "TRAFFIC", name: "Traffic" },
      { key: "RANKINGS", name: "Rankings" },
      { key: "AI_ANSWERS", name: "AI answers" },
      { key: "BACKLINKS", name: "Backlinks" },
    ]);
    expect((await member.query(api.topics.listTopics, { language: "it" })).map((topic) => topic.name)).toEqual(["Traffico", "Posizionamenti", "Risposte AI", "Backlink"]);
  });

  test("only the super admin adds, changes or deletes a topic", async () => {
    const t = harness();
    const { member } = await people(t);
    await expect(member.mutation(api.topics.createTopic, { nameEn: "Local search" })).rejects.toThrow();
    await expect(member.query(api.topics.listTopicsForAdmin, {})).rejects.toThrow();
  });

  test("a new topic gets a key from its name, goes where it is put, and a name already taken is refused", async () => {
    const t = harness();
    const { superAdmin } = await people(t);
    await t.mutation(internal.topics.seedFirstTopicsInternal, {});

    await superAdmin.mutation(api.topics.createTopic, { nameEn: "Local search", order: 2 });
    await superAdmin.mutation(api.topics.createTopic, { nameEn: "Local-search!" });
    const listed = await superAdmin.query(api.topics.listTopicsForAdmin, {});
    expect(listed.map((topic) => [topic.order, topic.key, topic.nameEn])).toEqual([
      [1, "TRAFFIC", "Traffic"],
      [2, "LOCAL_SEARCH", "Local search"],
      [3, "RANKINGS", "Rankings"],
      [4, "AI_ANSWERS", "AI answers"],
      [5, "BACKLINKS", "Backlinks"],
      [6, "LOCAL_SEARCH_2", "Local-search!"],
    ]);
    await expect(superAdmin.mutation(api.topics.createTopic, { nameEn: "  traffic " })).rejects.toThrow("already a topic called “Traffic”");
    expect(keyFromName("Réponses IA")).toBe("REPONSES_IA");
  });

  test("a rename keeps the key, so what uses the topic keeps it; a move renumbers the rest", async () => {
    const t = harness();
    const { superAdmin } = await people(t);
    await t.mutation(internal.topics.seedFirstTopicsInternal, {});
    const articleId = await superAdmin.mutation(api.knowledgeArticles.createArticle, { titleEn: "Clicks", bodyEn: "Words.", status: "PUBLISHED", topic: "TRAFFIC" });
    const traffic = (await superAdmin.query(api.topics.listTopicsForAdmin, {}))[0];

    await superAdmin.mutation(api.topics.updateTopic, { topicId: traffic._id, nameEn: "Visits", order: 4 });

    const listed = await superAdmin.query(api.topics.listTopicsForAdmin, {});
    expect(listed.map((topic) => [topic.order, topic.key, topic.nameEn])).toEqual([
      [1, "RANKINGS", "Rankings"],
      [2, "AI_ANSWERS", "AI answers"],
      [3, "BACKLINKS", "Backlinks"],
      [4, "TRAFFIC", "Visits"],
    ]);
    expect(listed[3].uses).toEqual({ knowledge: 1, helpful: 0, people: 0 });
    expect((await superAdmin.query(api.knowledgeArticles.getArticle, { articleId }))?.topic).toBe("TRAFFIC");
  });

  test("deleting a topic takes it off every article and person that used it, and closes its gap", async () => {
    const t = harness();
    const { superAdmin } = await people(t);
    await t.mutation(internal.topics.seedFirstTopicsInternal, {});
    const articleId = await superAdmin.mutation(api.knowledgeArticles.createArticle, { titleEn: "Ranks", bodyEn: "Words.", status: "PUBLISHED", topic: "RANKINGS" });
    const followId = await superAdmin.mutation(api.newsFollows.createFollow, { name: "Barry", whyEn: "News.", topic: "RANKINGS", channels: ["https://x.com/rustybrick"] });
    const libraryId = await superAdmin.mutation(api.libraryArticles.createArticle, {
      url: "https://example.com/ranking-systems",
      title: "Ranking systems",
      publication: "Example",
      author: "",
      publishedOn: "",
      updatedOn: "",
      description: "",
      topic: "RANKINGS",
      status: "DRAFT",
      body: "Words.",
    });
    const rankings = (await superAdmin.query(api.topics.listTopicsForAdmin, {}))[1];
    expect(rankings.uses).toEqual({ knowledge: 1, helpful: 1, people: 1 });

    await superAdmin.mutation(api.topics.deleteTopic, { topicId: rankings._id });

    expect((await superAdmin.query(api.topics.listTopicsForAdmin, {})).map((topic) => [topic.order, topic.key])).toEqual([[1, "TRAFFIC"], [2, "AI_ANSWERS"], [3, "BACKLINKS"]]);
    expect((await superAdmin.query(api.knowledgeArticles.getArticle, { articleId }))?.topic).toBeNull();
    expect((await superAdmin.query(api.newsFollows.getFollow, { followId }))?.topic).toBeNull();
    expect((await superAdmin.query(api.libraryArticles.getArticle, { articleId: libraryId }))?.topic).toBeNull();
    // A topic that has gone can no longer be chosen.
    await expect(superAdmin.mutation(api.knowledgeArticles.updateArticle, { articleId, titleEn: "Ranks", bodyEn: "Words.", status: "PUBLISHED", topic: "RANKINGS" }))
      .rejects.toThrow("That topic is no longer in the list");
  });

  test(`at most ${MAX_TOPICS} topics`, async () => {
    const t = harness();
    const { superAdmin } = await people(t);
    await t.run(async (ctx) => {
      for (let index = 0; index < MAX_TOPICS; index += 1) {
        await ctx.db.insert("topics", { key: `T${index}`, nameEn: `Topic ${index}`, position: index + 1, createdAt: 1, updatedAt: 1 });
      }
    });
    await expect(superAdmin.mutation(api.topics.createTopic, { nameEn: "One more" })).rejects.toThrow(`at most ${MAX_TOPICS} topics`);
  });
});
