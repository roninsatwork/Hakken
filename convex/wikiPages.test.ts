import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import {
  WIKI_PAGE_MAX_CHARS,
  buildRewriteUserContent,
  renderPageForReading,
  validateRewrittenPage,
} from "./wikiRewriteService";

/**
 * The wiki's ground rules (self-improving-wiki-plan.md): a rewrite replaces
 * the page and files the old text as a walkable revision; pinned human
 * corrections live outside the machine's text and survive everything; the
 * tenant walls hold; and an unknown correspondent never becomes a page.
 */

async function seedCompany(t: ReturnType<typeof convexTest>, name: string) {
  return await t.run(async (ctx) => ctx.db.insert("companies", { name, createdAt: Date.now() }));
}

describe("the wiki rewrite landing", () => {
  test("first contact creates the page and audits it; the next rewrite files a revision", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t, "Wiki Corp");

    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      subjectKey: "acme-hotels",
      title: "acme-hotels",
      content: "Prefers email. Has 12 rooms on the refurbishment plan.",
      source: "PHONE_CALL:call-1",
    });

    const created = await t.query(internal.wikiPages.getCustomerPageInternal, {
      companyId,
      subjectKey: "acme-hotels",
    });
    expect(created).toMatchObject({
      kind: "CUSTOMER",
      rewriteCount: 1,
      lastRewriteSource: "PHONE_CALL:call-1",
      pinnedCorrections: [],
    });

    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      subjectKey: "acme-hotels",
      title: "acme-hotels",
      content: "Prefers email. Refurbishment finished; asking about winter rates.",
      source: "EMAIL:msg-9",
    });

    const { page, revisions, auditTrail } = await t.run(async (ctx) => ({
      page: await ctx.db
        .query("wikiPages")
        .withIndex("by_company_kind_subject", (q) =>
          q.eq("companyId", companyId).eq("kind", "CUSTOMER").eq("subjectKey", "acme-hotels")
        )
        .unique(),
      revisions: await ctx.db.query("wikiPageRevisions").collect(),
      auditTrail: (await ctx.db.query("auditLogs").collect()).map((entry) => entry.actionType),
    }));

    // The changed fact was replaced, and the old text is walkable history.
    expect(page?.content).toContain("winter rates");
    expect(page?.content).not.toContain("12 rooms");
    expect(page?.rewriteCount).toBe(2);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({
      content: "Prefers email. Has 12 rooms on the refurbishment plan.",
      source: "EMAIL:msg-9",
    });
    expect(auditTrail).toEqual(["WIKI_PAGE_CREATED", "WIKI_PAGE_REWRITE"]);
  });

  test("an unchanged rewrite files no revision and makes no audit noise", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t, "Wiki Corp");
    const content = "Prefers email.";

    for (const source of ["PHONE_CALL:1", "PHONE_CALL:2"]) {
      await t.mutation(internal.wikiPages.applyRewriteInternal, {
        companyId,
        subjectKey: "acme",
        title: "acme",
        content,
        source,
      });
    }

    const { revisions, rewriteAudits } = await t.run(async (ctx) => ({
      revisions: await ctx.db.query("wikiPageRevisions").collect(),
      rewriteAudits: (await ctx.db.query("auditLogs").collect()).filter(
        (entry) => entry.actionType === "WIKI_PAGE_REWRITE"
      ),
    }));
    expect(revisions).toHaveLength(0);
    expect(rewriteAudits).toHaveLength(0);
  });

  test("pinned corrections live outside the machine's text and survive every rewrite", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t, "Wiki Corp");

    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      subjectKey: "acme",
      title: "acme",
      content: "First version.",
      source: "PHONE_CALL:1",
    });
    const pinnedAt = Date.now();
    await t.run(async (ctx) => {
      const page = await ctx.db
        .query("wikiPages")
        .withIndex("by_company_kind_subject", (q) =>
          q.eq("companyId", companyId).eq("kind", "CUSTOMER").eq("subjectKey", "acme")
        )
        .unique();
      await ctx.db.patch(page!._id, {
        pinnedCorrections: [{ text: "Their account manager is Dana, not Sam.", pinnedAt }],
      });
    });

    // The machine rewrites the body; the pinned layer is not its to touch.
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      subjectKey: "acme",
      title: "acme",
      content: "Second version, entirely different.",
      source: "EMAIL:2",
    });

    const page = await t.query(internal.wikiPages.getCustomerPageInternal, {
      companyId,
      subjectKey: "acme",
    });
    expect(page?.pinnedCorrections).toEqual([
      { text: "Their account manager is Dana, not Sam.", pinnedAt },
    ]);
    // And every reader sees the pinned layer, appended in code.
    expect(renderPageForReading(page!)).toContain("Their account manager is Dana, not Sam.");
  });

  test("pages are tenant-walled: the same subject key in another company is a different page", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyA = await seedCompany(t, "Company A");
    const companyB = await seedCompany(t, "Company B");

    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId: companyA,
      subjectKey: "acme",
      title: "acme",
      content: "Company A's view of acme.",
      source: "PHONE_CALL:1",
    });

    await expect(
      t.query(internal.wikiPages.getCustomerPageInternal, { companyId: companyB, subjectKey: "acme" })
    ).resolves.toBeNull();
  });
});

describe("matching a sender to a customer", () => {
  test("matches on either email column, normalised, inside the company wall only", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyA = await seedCompany(t, "Company A");
    const companyB = await seedCompany(t, "Company B");

    await t.run(async (ctx) => {
      await ctx.db.insert("salesDataCustomers", {
        companyId: companyA,
        accountNameKey: "acme-hotels",
        email: "Bookings@Acme.example",
        accountsEmail: "accounts@acme.example",
        updatedAt: Date.now(),
      });
    });

    await expect(
      t.query(internal.wikiPages.matchEmailSenderToCustomer, {
        companyId: companyA,
        email: "bookings@acme.example",
      })
    ).resolves.toBe("acme-hotels");
    await expect(
      t.query(internal.wikiPages.matchEmailSenderToCustomer, {
        companyId: companyA,
        email: "ACCOUNTS@acme.example",
      })
    ).resolves.toBe("acme-hotels");
    await expect(
      t.query(internal.wikiPages.matchEmailSenderToCustomer, {
        companyId: companyA,
        email: "stranger@nowhere.example",
      })
    ).resolves.toBeNull();
    // The same address asked from another company matches nothing.
    await expect(
      t.query(internal.wikiPages.matchEmailSenderToCustomer, {
        companyId: companyB,
        email: "bookings@acme.example",
      })
    ).resolves.toBeNull();
  });
});

describe("the knowing doors' read", () => {
  test("a matched phone number reads the whole page, pinned layer included; strangers read nothing", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t, "Wiki Corp");

    await t.run(async (ctx) => {
      await ctx.db.insert("salesDataCustomers", {
        companyId,
        accountNameKey: "acme-hotels",
        phone: "+44 20 7946 0000",
        updatedAt: Date.now(),
      });
    });
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      subjectKey: "acme-hotels",
      title: "acme-hotels",
      content: "Asking about winter rates.",
      source: "PHONE_CALL:1",
    });
    await t.run(async (ctx) => {
      const page = await ctx.db
        .query("wikiPages")
        .withIndex("by_company_kind_subject", (q) =>
          q.eq("companyId", companyId).eq("kind", "CUSTOMER").eq("subjectKey", "acme-hotels")
        )
        .unique();
      await ctx.db.patch(page!._id, {
        pinnedCorrections: [{ text: "Dana is their account manager.", pinnedAt: 1 }],
      });
    });

    // The provider sends E.164; the spreadsheet's spacing must not matter.
    const rendered = await t.query(internal.wikiPages.getRenderedPageForPhoneNumber, {
      companyId,
      phoneNumber: "+442079460000",
    });
    expect(rendered?.subjectKey).toBe("acme-hotels");
    expect(rendered?.pageText).toContain("winter rates");
    expect(rendered?.pageText).toContain("Dana is their account manager.");

    await expect(
      t.query(internal.wikiPages.getRenderedPageForPhoneNumber, {
        companyId,
        phoneNumber: "+44 7000 000000",
      })
    ).resolves.toBeNull();
  });

  test("a widget visitor who gave their email at the gateway reads their page; anonymous threads read nothing", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t, "Wiki Corp");

    const { widgetId } = await t.run(async (ctx) => {
      const widgetId = await ctx.db.insert("widgets", {
        companyId,
        name: "Website Bot",
        allowedDomains: ["*"],
        isActive: true,
        createdAt: Date.now(),
      });
      await ctx.db.insert("salesDataCustomers", {
        companyId,
        accountNameKey: "acme-hotels",
        email: "bookings@acme.example",
        updatedAt: Date.now(),
      });
      return { widgetId };
    });
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      subjectKey: "acme-hotels",
      title: "acme-hotels",
      content: "Asking about winter rates.",
      source: "EMAIL:1",
    });

    const { knownThreadId, anonymousThreadId } = await t.run(async (ctx) => {
      const base = { companyId, widgetId, title: "Widget", createdAt: Date.now(), updatedAt: Date.now() };
      const knownThreadId = await ctx.db.insert("threads", { ...base, widgetAccessTokenHash: "h1" });
      const anonymousThreadId = await ctx.db.insert("threads", { ...base, widgetAccessTokenHash: "h2" });
      await ctx.db.insert("messages", {
        threadId: knownThreadId,
        role: "user",
        content: "[System Gateway: User Pat <bookings@acme.example>]\n\nDo you have winter availability?",
        createdAt: Date.now(),
      });
      await ctx.db.insert("messages", {
        threadId: anonymousThreadId,
        role: "user",
        content: "Just browsing, what do you sell?",
        createdAt: Date.now(),
      });
      return { knownThreadId, anonymousThreadId };
    });

    const known = await t.query(internal.wikiPages.getRenderedPageForWidgetThread, {
      threadId: knownThreadId,
    });
    expect(known).toContain("winter rates");
    await expect(
      t.query(internal.wikiPages.getRenderedPageForWidgetThread, { threadId: anonymousThreadId })
    ).resolves.toBeNull();
  });

  test("a matched customer with no page yet reads nothing — first contact writes it", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t, "Wiki Corp");
    await expect(
      t.query(internal.wikiPages.getRenderedCustomerPageInternal, {
        companyId,
        subjectKey: "never-spoken-to",
      })
    ).resolves.toBeNull();
  });
});

describe("the rewrite contract", () => {
  test("an empty or wildly over-long answer is refused; barely over is clamped", () => {
    expect(validateRewrittenPage("   ")).toEqual({ ok: false, reason: "empty" });
    expect(validateRewrittenPage("x".repeat(WIKI_PAGE_MAX_CHARS * 2 + 1))).toEqual({
      ok: false,
      reason: "too_long",
    });
    const clamped = validateRewrittenPage("x".repeat(WIKI_PAGE_MAX_CHARS + 10));
    expect(clamped.ok).toBe(true);
    if (clamped.ok) expect(clamped.content).toHaveLength(WIKI_PAGE_MAX_CHARS);
  });

  test("the model is told about pinned corrections but never asked to rewrite them", () => {
    const content = buildRewriteUserContent({
      title: "acme",
      currentContent: "The page.",
      pinnedCorrections: [{ text: "Dana, not Sam.", pinnedAt: 1 }],
      eventLabel: "phone call",
      eventText: "The transcript.",
    });
    expect(content).toContain("ground truth");
    expect(content).toContain("Dana, not Sam.");
  });
});
