import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
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

// template:remove:start salesData
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
// template:remove:end


// template:remove:start salesData
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
// template:remove:end


describe("topic pages and the links between them", () => {
  test("the model's topic JSON is distrusted: bad kinds, bad slugs, and excess are dropped", async () => {
    const { parseTopicSuggestions, normaliseTopicSlug } = await import("./wikiRewriteService");
    expect(parseTopicSuggestions("no json here")).toEqual([]);
    expect(
      parseTopicSuggestions(
        JSON.stringify({
          topics: [
            { kind: "PRODUCT", slug: "Winter Linen Contracts", learned: "They exist." },
            { kind: "GOSSIP", slug: "not-a-kind", learned: "Dropped." },
            { kind: "POLICY", slug: "x", learned: "Slug too short, dropped." },
            { kind: "ISSUE", slug: "delivery-delays", learned: "Keeps coming up." },
            { kind: "POLICY", slug: "over-the-cap", learned: "Third topic, dropped." },
          ],
        })
      )
    ).toEqual([
      { kind: "PRODUCT", slug: "winter-linen-contracts", learned: "They exist." },
      { kind: "ISSUE", slug: "delivery-delays", learned: "Keeps coming up." },
    ]);
    // One naming rule: spacing, case and punctuation collapse to one page.
    expect(normaliseTopicSlug("  Delivery Times!  ")).toBe("delivery-times");
    expect(normaliseTopicSlug("x")).toBeNull();
  });

  test("links are a set on both ends, and a customer's read carries its neighbourhood", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t, "Wiki Corp");

    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      subjectKey: "acme",
      title: "acme",
      content: "Asked about winter linen.",
      source: "PHONE_CALL:1",
    });
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      kind: "PRODUCT",
      subjectKey: "winter-linen-contracts",
      title: "winter-linen-contracts",
      content: "Seasonal contracts run October to March.",
      source: "PHONE_CALL:1",
    });
    for (let i = 0; i < 2; i++) {
      await t.mutation(internal.wikiPages.addLinksInternal, {
        companyId,
        kind: "CUSTOMER",
        subjectKey: "acme",
        add: ["PRODUCT:winter-linen-contracts"],
      });
    }

    const page = await t.query(internal.wikiPages.getCustomerPageInternal, {
      companyId,
      subjectKey: "acme",
    });
    expect(page?.links).toEqual(["PRODUCT:winter-linen-contracts"]);

    const rendered = await t.query(internal.wikiPages.getRenderedCustomerPageInternal, {
      companyId,
      subjectKey: "acme",
    });
    expect(rendered).toContain("Asked about winter linen.");
    expect(rendered).toContain("October to March");
  });

  test("the title index finds topic pages by name and never surfaces a customer page", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t, "Wiki Corp");

    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      kind: "POLICY",
      subjectKey: "delivery-times",
      title: "delivery-times",
      content: "Deliveries go out Tuesdays and Fridays.",
      source: "EMAIL:1",
    });
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      subjectKey: "delivery-obsessed-customer",
      title: "delivery-obsessed-customer",
      content: "Asks about delivery every week.",
      source: "EMAIL:1",
    });

    const matches = await t.query(internal.wikiPages.findTopicPagesForQueryInternal, {
      companyId,
      query: "when are your delivery days?",
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toContain("Tuesdays and Fridays");
    expect(matches[0]).not.toContain("Asks about delivery every week.");
  });
});

describe("the answering read", () => {
  test("a question finds pages by name and words, takes one hop, and respects the customer wall", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t, "Wiki Corp");

    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      kind: "POLICY",
      subjectKey: "delivery-times",
      title: "delivery-times",
      content: "Deliveries go out Tuesdays and Fridays.",
      source: "DOCUMENT:doc-1",
    });
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      kind: "POLICY",
      subjectKey: "rush-orders",
      title: "rush-orders",
      content: "Rush work is possible but priced separately.",
      source: "DOCUMENT:doc-1",
    });
    await t.mutation(internal.wikiPages.addLinksInternal, {
      companyId,
      kind: "POLICY",
      subjectKey: "delivery-times",
      add: ["POLICY:rush-orders"],
    });
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      subjectKey: "delivery-obsessed-customer",
      title: "delivery-obsessed-customer",
      content: "Asks about delivery constantly.",
      source: "EMAIL:1",
    });

    const anonymous = await t.query(internal.wikiPages.getWikiAnswerContextInternal, {
      companyId,
      query: "when are your delivery days?",
      includeCustomerPages: false,
    });
    // The named page, whole — and its linked neighbour came along for the hop.
    expect(anonymous.context).toContain("Tuesdays and Fridays");
    expect(anonymous.context).toContain("priced separately");
    expect(anonymous.context).not.toContain("Asks about delivery constantly");
    expect(anonymous.pageKeys).toEqual(["POLICY:delivery-times", "POLICY:rush-orders"]);

    // Staff surfaces may see their own customers.
    const staff = await t.query(internal.wikiPages.getWikiAnswerContextInternal, {
      companyId,
      query: "what do we know about the delivery obsessed customer?",
      includeCustomerPages: true,
    });
    expect(staff.context).toContain("Asks about delivery constantly");

    // A question the wiki knows nothing about reads as nothing, not filler.
    await expect(
      t.query(internal.wikiPages.getWikiAnswerContextInternal, {
        companyId,
        query: "quantum blockchain arbitrage?",
        includeCustomerPages: false,
      })
    ).resolves.toEqual({ context: "", pageKeys: [] });
  });

  test("the stage-three switch defaults on, and the exam seeds once", async () => {
    const { companyAnswersFromWiki } = await import("./wikiRewriteService");
    expect(companyAnswersFromWiki(null)).toBe(true);
    expect(companyAnswersFromWiki({})).toBe(true);
    expect(companyAnswersFromWiki({ answersFromWiki: false })).toBe(false);

    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t, "Wiki Corp");
    const first = await t.mutation(internal.wikiExam.seedWikiExamCasesInternal, { companyId });
    const second = await t.mutation(internal.wikiExam.seedWikiExamCasesInternal, { companyId });
    expect(first).toEqual({ created: 20, updated: 0 });
    expect(second).toEqual({ created: 0, updated: 20 });
  });
});

describe("links live in the writing", () => {
  test("a page's [[references]] become links on both ends; ghosts resolve to nothing", async () => {
    const { extractWikiLinkSlugs } = await import("./wikiRewriteService");
    expect(extractWikiLinkSlugs("See [[Winter Linen Contracts]] and [[invoicing]], not [[x]].")).toEqual([
      "winter-linen-contracts",
      "invoicing",
    ]);

    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t, "Wiki Corp");
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      kind: "POLICY",
      subjectKey: "invoicing",
      title: "invoicing",
      content: "Invoices go to accounts offices.",
      source: "DOCUMENT:doc-1",
    });
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      kind: "PRODUCT",
      subjectKey: "winter-linen-contracts",
      title: "winter-linen-contracts",
      content:
        "Seasonal contracts run October to March; billing follows [[invoicing]], and [[a-page-that-never-existed]] is no page at all.",
      source: "DOCUMENT:doc-1",
    });

    const { writer, target } = await t.run(async (ctx) => ({
      writer: await ctx.db
        .query("wikiPages")
        .withIndex("by_company_kind_subject", (q) =>
          q.eq("companyId", companyId).eq("kind", "PRODUCT").eq("subjectKey", "winter-linen-contracts")
        )
        .unique(),
      target: await ctx.db
        .query("wikiPages")
        .withIndex("by_company_kind_subject", (q) =>
          q.eq("companyId", companyId).eq("kind", "POLICY").eq("subjectKey", "invoicing")
        )
        .unique(),
    }));
    expect(writer?.links).toContain("POLICY:invoicing");
    expect(writer?.links).not.toContain("ISSUE:a-page-that-never-existed");
    expect(target?.links).toContain("PRODUCT:winter-linen-contracts");
  });

  test("hub index pages list their members, link both ways, and stay out of the model's hands", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t, "Wiki Corp");
    for (const slug of ["web-development", "mobile-apps"]) {
      await t.mutation(internal.wikiPages.applyRewriteInternal, {
        companyId,
        kind: "PRODUCT",
        subjectKey: slug,
        title: slug,
        content: `About ${slug}.`,
        source: "DOCUMENT:doc-1",
      });
    }
    await t.mutation(internal.wikiPages.refreshHubPagesInternal, { companyId });

    const { hub, member } = await t.run(async (ctx) => ({
      hub: await ctx.db
        .query("wikiPages")
        .withIndex("by_company_kind_subject", (q) =>
          q.eq("companyId", companyId).eq("kind", "PRODUCT").eq("subjectKey", "products-index")
        )
        .unique(),
      member: await ctx.db
        .query("wikiPages")
        .withIndex("by_company_kind_subject", (q) =>
          q.eq("companyId", companyId).eq("kind", "PRODUCT").eq("subjectKey", "web-development")
        )
        .unique(),
    }));
    expect(hub?.content).toContain("[[web-development]]");
    // Membership, not order: the hub now reads its members off the kind
    // index, which is subject-alphabetical.
    expect([...(hub?.links ?? [])].sort()).toEqual(["PRODUCT:mobile-apps", "PRODUCT:web-development"]);
    expect(member?.links).toContain("PRODUCT:products-index");

    // The catch-up linker's list never offers a hub to the model.
    const sparseTopics = await t.query(internal.wikiPages.listSparselyLinkedTopicsInternal, {
      companyId,
      limit: 10,
    });
    expect(sparseTopics.map((page) => page.subjectKey)).not.toContain("products-index");
  });
});

describe("full import first: the source-note layer", () => {
  test("a document becomes its own full note — capped, revisioned, receipted, never model-shaped", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t, "Wiki Corp");

    const longText = `The whole document. ${"detail ".repeat(50)}`;
    await t.mutation(internal.wikiPages.upsertSourceNoteInternal, {
      companyId,
      documentId: "doc-1",
      title: "How we work — ronins.co.uk",
      text: longText,
      sourceLabel: "Website · ronins.co.uk/how-we-work",
    });
    // The same text again is a no-op; changed text files a revision.
    await t.mutation(internal.wikiPages.upsertSourceNoteInternal, {
      companyId,
      documentId: "doc-1",
      title: "How we work — ronins.co.uk",
      text: longText,
      sourceLabel: "Website · ronins.co.uk/how-we-work",
    });
    await t.mutation(internal.wikiPages.upsertSourceNoteInternal, {
      companyId,
      documentId: "doc-1",
      title: "How we work — ronins.co.uk",
      text: "The document, re-scraped and different.",
      sourceLabel: "Website · ronins.co.uk/how-we-work",
    });

    const { note, revisions } = await t.run(async (ctx) => {
      const note = await ctx.db
        .query("wikiPages")
        .withIndex("by_company_kind_subject", (q) =>
          q.eq("companyId", companyId).eq("kind", "SOURCE").eq("subjectKey", "doc-1")
        )
        .unique();
      return {
        note,
        revisions: await ctx.db.query("wikiPageRevisions").collect(),
      };
    });
    expect(note?.content).toBe("The document, re-scraped and different.");
    expect(note?.title).toContain("How we work");
    expect(revisions).toHaveLength(1);
    expect(revisions[0].content).toContain("The whole document.");
  });

  test("the backfill road links a source note to every page its document taught", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t, "Wiki Corp");
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      kind: "POLICY",
      subjectKey: "how-we-work",
      title: "how-we-work",
      content: "Paid discovery first.",
      source: "DOCUMENT:doc-1",
    });
    await t.mutation(internal.wikiPages.upsertSourceNoteInternal, {
      companyId,
      documentId: "doc-1",
      title: "How we work",
      text: "The full document.",
      sourceLabel: "Website · ronins.co.uk/how-we-work",
    });
    await t.mutation(internal.wikiPages.linkSourceNoteToTaughtPagesInternal, {
      companyId,
      documentId: "doc-1",
    });

    const { note, taught } = await t.run(async (ctx) => ({
      note: await ctx.db
        .query("wikiPages")
        .withIndex("by_company_kind_subject", (q) =>
          q.eq("companyId", companyId).eq("kind", "SOURCE").eq("subjectKey", "doc-1")
        )
        .unique(),
      taught: await ctx.db
        .query("wikiPages")
        .withIndex("by_company_kind_subject", (q) =>
          q.eq("companyId", companyId).eq("kind", "POLICY").eq("subjectKey", "how-we-work")
        )
        .unique(),
    }));
    expect(note?.links).toContain("POLICY:how-we-work");
    expect(taught?.links).toContain("SOURCE:doc-1");
  });

  test("source notes stay out of the prose-weaving index but are open to the answer chooser", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t, "Wiki Corp");
    await t.mutation(internal.wikiPages.upsertSourceNoteInternal, {
      companyId,
      documentId: "doc-1",
      title: "How we work",
      text: "The full document.",
      sourceLabel: "Website · x",
    });

    const weaving = await t.query(internal.wikiPages.getWikiIndexInternal, {
      companyId,
      includeCustomerPages: false,
    });
    const choosing = await t.query(internal.wikiPages.getWikiIndexInternal, {
      companyId,
      includeCustomerPages: false,
      includeSourceNotes: true,
    });
    expect(weaving.map((entry) => entry.key)).not.toContain("SOURCE:doc-1");
    expect(choosing.map((entry) => entry.key)).toContain("SOURCE:doc-1");

    // And the linker never offers a source note to the model either.
    await expect(
      t.query(internal.wikiPages.listSparselyLinkedTopicsInternal, { companyId, limit: 10 })
    ).resolves.toEqual([]);
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

/**
 * The islands bug (2026-08-20). Every topic a document establishes is born
 * linked to its siblings and down to its source note. Counting that source
 * link as a connection put a three-topic document's pages at the old
 * threshold of three on the day they were written, so the Linker never
 * looked at them again and no bridge between documents was ever built. The
 * map showed exactly that: tight per-document clusters, no lines between.
 */
describe("the catch-up linker's list", () => {
  async function seedLinkedPage(
    t: ReturnType<typeof convexTest>,
    companyId: Awaited<ReturnType<typeof seedCompany>>,
    subjectKey: string,
    links: string[],
    lastTendedAt?: number
  ) {
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      kind: "POLICY",
      subjectKey,
      title: subjectKey,
      content: `About ${subjectKey}.`,
      source: "DOCUMENT:doc-1",
    });
    await t.mutation(internal.wikiPages.addLinksInternal, {
      companyId,
      kind: "POLICY",
      subjectKey,
      add: links,
    });
    if (lastTendedAt !== undefined) {
      const page = await t.query(internal.wikiPages.getPageOfKindInternal, {
        companyId,
        kind: "POLICY",
        subjectKey,
      });
      if (page) await t.run(async (ctx) => ctx.db.patch(page._id, { lastTendedAt }));
    }
  }

  test("a page linked only to its siblings and its own document is still sparse", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t, "Wiki Corp");

    // Exactly what the distiller writes for one of three topics.
    await seedLinkedPage(t, companyId, "iffo-ai-usage-policy", [
      "POLICY:iffo-ai-governance",
      "POLICY:iffo-approved-ai-tools",
      "SOURCE:doc-1",
    ]);

    const sparse = await t.query(internal.wikiPages.listSparselyLinkedTopicsInternal, {
      companyId,
      limit: 10,
    });
    expect(sparse.map((page) => page.subjectKey)).toContain("iffo-ai-usage-policy");
  });

  test("three links to other topics is genuinely connected, and rests", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t, "Wiki Corp");

    await seedLinkedPage(t, companyId, "well-connected", [
      "POLICY:a",
      "POLICY:b",
      "POLICY:c",
      "SOURCE:doc-1",
    ]);
    // Sparse, but read within the week — it waits its turn rather than
    // costing a model call every night.
    await seedLinkedPage(t, companyId, "recently-read", ["SOURCE:doc-2"], Date.now());

    const sparse = await t.query(internal.wikiPages.listSparselyLinkedTopicsInternal, {
      companyId,
      limit: 10,
    });
    expect(sparse.map((page) => page.subjectKey)).toEqual([]);
  });
});

describe("the goals door (personal-layer-and-goals-plan.md, part 1)", () => {
  async function seedSuperAdmin(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "owner@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      })
    );
  }

  test("a person writes a goal: slugged, audited, signed as human work", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t, "Wiki Corp");
    const adminId = await seedSuperAdmin(t);
    const admin = t.withIdentity({ subject: adminId });

    const pageId = await admin.mutation(api.wikiPages.createGoalPageForCompany, {
      companyId,
      title: "Grow Comax revenue",
      content: "Lift Comax to £1m by year end, measured monthly.",
    });

    const page = await t.run(async (ctx) => ctx.db.get(pageId));
    expect(page?.kind).toBe("GOAL");
    expect(page?.subjectKey).toBe("grow-comax-revenue");
    expect(page?.lastRewriteSource).toBe(`HUMAN:${adminId}`);
    expect(page?.pinnedCorrections).toEqual([]);

    const audits = await t.run(async (ctx) => ctx.db.query("auditLogs").collect());
    const created = audits.filter((row) => row.actionType === "WIKI_PAGE_HUMAN_CREATE");
    expect(created).toHaveLength(1);
    expect(created[0].actorId).toBe(adminId);
  });

  test("the same name twice is refused — edit the page instead", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t, "Wiki Corp");
    const adminId = await seedSuperAdmin(t);
    const admin = t.withIdentity({ subject: adminId });

    await admin.mutation(api.wikiPages.createGoalPageForCompany, {
      companyId,
      title: "Grow Comax revenue",
      content: "The aim.",
    });
    await expect(
      admin.mutation(api.wikiPages.createGoalPageForCompany, {
        companyId,
        title: "Grow Comax revenue",
        content: "The aim again.",
      })
    ).rejects.toThrow();
  });

  test("the hub pass grows goals-index and back-links every goal to it", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t, "Wiki Corp");
    const adminId = await seedSuperAdmin(t);
    const admin = t.withIdentity({ subject: adminId });

    await admin.mutation(api.wikiPages.createGoalPageForCompany, {
      companyId,
      title: "Grow Comax revenue",
      content: "The aim.",
    });
    await t.mutation(internal.wikiPages.refreshHubPagesInternal, { companyId });

    const pages = await t.run(async (ctx) => ctx.db.query("wikiPages").collect());
    const hub = pages.find((page) => page.subjectKey === "goals-index");
    expect(hub?.kind).toBe("GOAL");
    expect(hub?.links).toContain("GOAL:grow-comax-revenue");
    const goal = pages.find((page) => page.subjectKey === "grow-comax-revenue");
    expect(goal?.links).toContain("GOAL:goals-index");
  });

  test("report grounding reads the goals and skips the hub", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t, "Wiki Corp");
    const adminId = await seedSuperAdmin(t);
    const admin = t.withIdentity({ subject: adminId });

    await admin.mutation(api.wikiPages.createGoalPageForCompany, {
      companyId,
      title: "Grow Comax revenue",
      content: "The aim.",
    });
    await t.mutation(internal.wikiPages.refreshHubPagesInternal, { companyId });

    const goals = await t.query(internal.wikiPages.getGoalPagesInternal, { companyId });
    expect(goals.map((goal) => goal.title)).toEqual(["Grow Comax revenue"]);
  });

  test("a [[reference]] to a goal resolves like any topic link", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t, "Wiki Corp");
    const adminId = await seedSuperAdmin(t);
    const admin = t.withIdentity({ subject: adminId });

    await admin.mutation(api.wikiPages.createGoalPageForCompany, {
      companyId,
      title: "Grow Comax revenue",
      content: "The aim.",
    });
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      kind: "POLICY",
      subjectKey: "pricing",
      title: "pricing",
      content: "Discounts serve [[grow-comax-revenue]].",
      source: "DOCUMENT:doc-1",
    });

    const pages = await t.run(async (ctx) => ctx.db.query("wikiPages").collect());
    const policy = pages.find((page) => page.subjectKey === "pricing");
    expect(policy?.links).toContain("GOAL:grow-comax-revenue");
  });
});

describe("goals stay out of the machine's mouth", () => {
  test("the distiller's topic kinds never include GOAL", async () => {
    // personal-layer-and-goals-plan.md, part 1: goals are human intent. If
    // WIKI_TOPIC_KINDS ever widens to GOAL, the distiller starts writing
    // aims from documents and this rule breaks silently.
    const { WIKI_TOPIC_KINDS, parseTopicSuggestions } = await import("./wikiRewriteService");
    expect(WIKI_TOPIC_KINDS).not.toContain("GOAL");
    const parsed = parseTopicSuggestions(
      JSON.stringify({ topics: [{ kind: "GOAL", slug: "grow-comax", learned: "An aim." }] })
    );
    expect(parsed).toEqual([]);
  });
});

describe("the chooser's index reads freshest-first", () => {
  test("the newest-updated page leads the index, so the cap cuts stale pages, not fresh ones", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t, "Wiki Corp");
    const base = Date.now();
    await t.run(async (ctx) => {
      for (const [subjectKey, updatedAt] of [
        ["old-page", base - 200_000],
        ["newest-page", base],
        ["middling-page", base - 100_000],
      ] as const) {
        await ctx.db.insert("wikiPages", {
          companyId,
          kind: "POLICY" as const,
          subjectKey,
          title: subjectKey,
          content: "Words.",
          links: [],
          pinnedCorrections: [],
          rewriteCount: 1,
          lastRewriteSource: "DOCUMENT:doc-1",
          createdAt: updatedAt,
          updatedAt,
        });
      }
    });

    const index = await t.query(internal.wikiPages.getWikiIndexInternal, {
      companyId,
      includeCustomerPages: false,
    });
    expect(index.map((entry) => entry.key)).toEqual([
      "POLICY:newest-page",
      "POLICY:middling-page",
      "POLICY:old-page",
    ]);
  });
});

describe("the two-stage index (wiki-scaling-note.md)", () => {
  test("past the full-index limit, the question's words reach a page too old for the recent slice", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t, "Wiki Corp");
    const base = Date.now();
    const { WIKI_INDEX_FULL_LIMIT } = await import("./wikiPages");

    await t.run(async (ctx) => {
      // The oldest page on the shelf, about winter linen.
      await ctx.db.insert("wikiPages", {
        companyId,
        kind: "POLICY" as const,
        subjectKey: "winter-linen-contracts",
        title: "winter-linen-contracts",
        content: "Winter linen contracts renew in October.",
        searchText: "winter-linen-contracts winter linen contracts renew in october",
        links: [],
        pinnedCorrections: [],
        rewriteCount: 1,
        lastRewriteSource: "DOCUMENT:doc-1",
        createdAt: base - 10_000_000,
        updatedAt: base - 10_000_000,
      });
      // Enough newer pages to push the wiki past the full-index limit.
      for (let i = 0; i < WIKI_INDEX_FULL_LIMIT + 10; i++) {
        await ctx.db.insert("wikiPages", {
          companyId,
          kind: "POLICY" as const,
          subjectKey: `filler-${i}`,
          title: `filler-${i}`,
          content: "Filler.",
          searchText: `filler-${i} filler`,
          links: [],
          pinnedCorrections: [],
          rewriteCount: 1,
          lastRewriteSource: "DOCUMENT:doc-1",
          createdAt: base - i,
          updatedAt: base - i,
        });
      }
    });

    // Without the question, the old page is beyond the recent slice.
    const blind = await t.query(internal.wikiPages.getWikiIndexInternal, {
      companyId,
      includeCustomerPages: false,
    });
    expect(blind.map((entry) => entry.key)).not.toContain("POLICY:winter-linen-contracts");

    // The question's own words bring it into the index.
    const asked = await t.query(internal.wikiPages.getWikiIndexInternal, {
      companyId,
      includeCustomerPages: false,
      query: "when do the winter linen contracts renew?",
    });
    expect(asked.map((entry) => entry.key)).toContain("POLICY:winter-linen-contracts");
    // And the shortlist stays bounded — nowhere near the whole shelf.
    expect(asked.length).toBeLessThanOrEqual(260);
  });
});

describe("hubs survive their own success", () => {
  test("a hub with hundreds of members stays inside the page cap and counts the rest", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t, "Wiki Corp");
    const base = Date.now();
    await t.run(async (ctx) => {
      for (let i = 0; i < 300; i++) {
        await ctx.db.insert("wikiPages", {
          companyId,
          kind: "PRODUCT" as const,
          subjectKey: `product-number-${i}`,
          title: `product-number-${i}`,
          content: "A product.",
          links: [],
          pinnedCorrections: [],
          rewriteCount: 1,
          lastRewriteSource: "DOCUMENT:doc-1",
          createdAt: base - i,
          updatedAt: base - i,
        });
      }
    });

    await t.mutation(internal.wikiPages.refreshHubPagesInternal, { companyId });

    const hub = await t.run(async (ctx) =>
      ctx.db
        .query("wikiPages")
        .withIndex("by_company_kind_subject", (q) =>
          q.eq("companyId", companyId).eq("kind", "PRODUCT").eq("subjectKey", "products-index")
        )
        .unique()
    );
    expect(hub).not.toBeNull();
    expect(hub!.content.length).toBeLessThanOrEqual(WIKI_PAGE_MAX_CHARS);
    expect(hub!.content).toContain("more.");
    // The links array stays complete — the map and backlinks need every member.
    expect(hub!.links).toHaveLength(300);
    // The most recently touched member is named; the oldest is only counted.
    expect(hub!.content).toContain("[[product-number-0]]");
    expect(hub!.content).not.toContain("[[product-number-299]]");
  });
});

describe("every wiki door hands back the shape it declares", () => {
  /**
   * Eleven of the thirteen client-callable doors here had no test that reached
   * them, so their declared shapes were checked by the compiler and by nothing
   * at run time — and the compiler cannot see a field the handler sends but the
   * declaration does not name. That is the failure a validator exists to catch,
   * and it only fires when something calls the door.
   *
   * Each door is read with real content behind it, and the count of what came
   * back is asserted, so a door that returned nothing cannot pass by having
   * nothing to be wrong about.
   */
  const seedWiki = async (t: ReturnType<typeof convexTest>) => {
    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", { name: "Shape Corp", createdAt: Date.now() }));
    const adminId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "shapes@test.com", role: "SUPER_ADMIN", createdAt: Date.now() }));

    // The platform shelf holds nothing company-specific, so its page is a
    // policy rather than a customer — the same door, a kind it will accept.
    for (const scope of [{ companyId, kind: "CUSTOMER" as const }, { companyId: undefined, kind: "POLICY" as const }]) {
      await t.mutation(internal.wikiPages.applyRewriteInternal, {
        ...scope,
        subjectKey: "riverside-hotels",
        title: "riverside-hotels",
        content: "Prefers email. Twelve rooms on the refurbishment plan, see [[winter-rates]].",
        source: "PHONE_CALL:call-7",
      });
      await t.mutation(internal.wikiPages.applyRewriteInternal, {
        ...scope,
        subjectKey: "riverside-hotels",
        title: "riverside-hotels",
        content: "Prefers email. Refurbishment finished; asking about winter rates.",
        source: "EMAIL:msg-12",
      });
    }

    return { companyId, admin: t.withIdentity({ subject: adminId }) };
  };

  const paginationOpts = { numItems: 10, cursor: null };

  test("the company doors", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { companyId, admin } = await seedWiki(t);

    const list = await admin.query(api.wikiPages.listPagesForCompany, { companyId, paginationOpts });
    const map = await admin.query(api.wikiPages.listPagesForMapForCompany, { companyId });
    const search = await admin.query(api.wikiPages.searchPagesForCompany, { companyId, term: "riverside" });
    const exported = await admin.query(api.wikiPages.getExportForCompany, { companyId });
    const detail = await admin.query(api.wikiPages.getPageDetailForCompany, {
      companyId,
      pageId: map[0].pageId,
    });

    expect({
      list: list.page.length,
      map: map.length,
      search: search.length,
      exported: exported.length,
      detailRevisions: detail?.revisions.length ?? 0,
    }).toEqual({ list: 1, map: 1, search: 1, exported: 1, detailRevisions: 1 });
  });

  test("the platform doors", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { admin } = await seedWiki(t);

    const list = await admin.query(api.wikiPages.listPagesForGlobal, { paginationOpts });
    const map = await admin.query(api.wikiPages.listPagesForMapForGlobal, {});
    const search = await admin.query(api.wikiPages.searchPagesForGlobal, { term: "riverside" });
    const exported = await admin.query(api.wikiPages.getExportForGlobal, {});
    const detail = await admin.query(api.wikiPages.getPageDetailForGlobal, { pageId: map[0].pageId });

    expect({
      list: list.page.length,
      map: map.length,
      search: search.length,
      exported: exported.length,
      detailRevisions: detail?.revisions.length ?? 0,
    }).toEqual({ list: 1, map: 1, search: 1, exported: 1, detailRevisions: 1 });
  });

  test("clearing a company wiki reports what it removed", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { companyId, admin } = await seedWiki(t);

    expect(await admin.mutation(api.wikiPages.clearWikiForCompany, { companyId }))
      .toEqual({ deleted: 1, remaining: 0 });
  });

  test("a person writes a platform goal", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { admin } = await seedWiki(t);

    const pageId = await admin.mutation(api.wikiPages.createGoalPageForGlobal, {
      title: "Ship the framework",
      content: "One baseline every product forks from.",
    });

    expect(await t.run(async (ctx) => (await ctx.db.get(pageId))?.kind)).toBe("GOAL");
  });
});
