import { defineTable } from "convex/server";
import { v } from "convex/values";
import { decisionCertaintyValidator } from "./utils/decisionShapes";

/**
 * The company wiki's tables, moved out of `schema.ts` on 21 November 2026 so the wiki can grow
 * (wiki-sonae-catch-up-plan-2026-11-21.md: `schema.ts` was 6 lines under its size limit in `code-ratchets.json`).
 * Base-module schema, as before: every template keeps the wiki.
 */
export const wikiTables = {
  /**
   * The self-improving wiki: whole pages Hakken writes and tends itself, one
   * per subject, rewritten after conversations — never chunked, never
   * embedded (self-improving-wiki-plan.md, decisions 1-3). The machine's
   * text lives in `content`; pinned human corrections are a separate layer
   * the machine cannot touch, appended in code wherever the page is read —
   * survival by construction, not by prompt obedience.
   */
  wikiPages: defineTable({
    // Absent means the global brain (global-wiki-plan.md): the platform's
    // own shelf, readable by every company's answers, holding nothing
    // company-specific — the same convention knowledgeDocuments uses.
    companyId: v.optional(v.id("companies")),
    // CUSTOMER pages are keyed by the salesDataCustomers accountNameKey and
    // born from matched calls and emails. The topic kinds (phase 5) are
    // named by the model as conversations touch them: what the company
    // sells (PRODUCT), how it works (POLICY), what keeps coming up (ISSUE).
    kind: v.union(
      v.literal("CUSTOMER"),
      v.literal("PRODUCT"),
      v.literal("POLICY"),
      v.literal("ISSUE"),
      // Work the company has done for a named client: one page per client
      // or case study, so "who have you worked with" has pages to answer
      // from rather than a product list (Sonae `187a0aac`, client-work pages;
      // wiki-sonae-catch-up-plan-2026-11-21.md, 1.2).
      v.literal("CLIENT"),
      // Full-import-first (wiki-agents plan, phase 3): one full note per
      // ingested document, substantially intact — the layer the synthesis
      // pages stand on, mechanical and never model-shortened.
      v.literal("SOURCE"),
      // What the company is aiming at (personal-layer-and-goals-plan.md):
      // human-authored intent, never distilled from documents and never
      // model-tidied — the staff's only move on a stale goal is a question.
      v.literal("GOAL")
    ),
    subjectKey: v.string(),
    title: v.string(),
    content: v.string(),
    // Subject keys of pages this page mentions; the map is drawn from these.
    links: v.array(v.string()),
    // No user id on the pin itself: who pinned it lives in the audit trail
    // (WIKI_PAGE_PIN, retained as oversight evidence), so a person's erasure
    // never has to reach inside this array to be provably complete.
    pinnedCorrections: v.array(
      v.object({
        text: v.string(),
        pinnedAt: v.number(),
      })
    ),
    rewriteCount: v.number(),
    // How many DOCUMENT receipts this page holds (wikiPageSources is the
    // truth; this is the list screen's cheap copy of it).
    documentSourceCount: v.optional(v.number()),
    // What last changed the page: "PHONE_CALL:<id>", "EMAIL:<gmail id>",
    // "HUMAN:<user id>", "DOCUMENT:<id>", "TENDING".
    lastRewriteSource: v.string(),
    // When the nightly tending pass last considered this page, so a tidy
    // page is not re-tidied for nothing (wiki plan, phase 4).
    lastTendedAt: v.optional(v.number()),
    // How many answers this page has stood under, and when it last did
    // (closing-the-loop plan, phase 2). Denormalised at answer time the
    // way receipts are — never a scan at read time.
    usageCount: v.optional(v.number()),
    lastUsedAt: v.optional(v.number()),
    // When the Freshness Checker last verified this page against its kept
    // sources (wiki-agents plan, phase 2). Absent means never checked.
    lastVerifiedAt: v.optional(v.number()),
    // The nightly check-up's rota stamps (Sonae's wiki-daily-checkup-plan.md;
    // wiki-sonae-catch-up-plan-2026-11-21.md, 2.1). Each check visits the
    // pages it has not seen for longest, absent first, so across its cycle
    // every page is covered however large the wiki.
    lastLinkCheckedAt: v.optional(v.number()),
    lastContradictionCheckedAt: v.optional(v.number()),
    lastRefileCheckedAt: v.optional(v.number()),
    lastTagCheckedAt: v.optional(v.number()),
    // The page's tags, the list screen's cheap copy; `wikiPageTags` is the
    // truth and says which ones a person added.
    tags: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
    // Title, subject key and body in one field, kept in step on every write.
    // The list's search used to read five hundred pages into the browser and
    // sift them there, which silently hid page five hundred and one.
    searchText: v.optional(v.string()),
    // A published Knowledge article's copy: a person's writing the wiki staff never change (utils/knowledgePageGuard.ts).
    knowledgeArticleId: v.optional(v.id("knowledgeArticles")),
  })
    .index("by_company_kind_subject", ["companyId", "kind", "subjectKey"])
    .index("by_company_updated", ["companyId", "updatedAt"])
    .index("by_company_link_checked", ["companyId", "lastLinkCheckedAt"])
    // Per kind, so a rota that only concerns topic pages never wades
    // through the far larger source notes to find them.
    .index("by_company_kind_contradiction", ["companyId", "kind", "lastContradictionCheckedAt"])
    .index("by_company_kind_verified", ["companyId", "kind", "lastVerifiedAt"])
    .index("by_company_kind_refile", ["companyId", "kind", "lastRefileCheckedAt"])
    .index("by_company_kind_tag", ["companyId", "kind", "lastTagCheckedAt"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["companyId", "kind"],
    }),

  /**
   * The receipts behind a page (wiki-replaces-knowledge plan, screen 3):
   * which documents and conversations taught it. One row per page-and-source
   * pair — a document that teaches the same page twice is still one receipt.
   * Document rows point at `knowledgeDocuments`, which this plan keeps as
   * stored originals precisely so these rows always have something to open.
   */
  wikiPageSources: defineTable({
    pageId: v.id("wikiPages"),
    companyId: v.optional(v.id("companies")),
    kind: v.union(
      v.literal("DOCUMENT"),
      v.literal("PHONE_CALL"),
      v.literal("EMAIL"),
      v.literal("HUMAN"),
      // A durable synthesis filed back from an answered question
      // (wiki-agents plan, phase 5).
      v.literal("CHAT")
    ),
    /** Document id, call id, mailbox message id, or user id — as text. */
    ref: v.string(),
    /** What a person sees on the page's source list. */
    label: v.string(),
    addedAt: v.number(),
  })
    .index("by_page", ["pageId", "addedAt"])
    .index("by_page_ref", ["pageId", "kind", "ref"])
    // Reverse lookup: which pages did this document teach — the source-note
    // backfill's road from a document to its synthesis pages.
    .index("by_company_ref", ["companyId", "kind", "ref"]),

  /**
   * One row per company: the distiller's progress, drawn on the Wiki
   * screen while an import (or the one-time catch-up) is being read.
   */
  wikiDistillState: defineTable({
    companyId: v.optional(v.id("companies")),
    documentsRead: v.number(),
    pagesWritten: v.number(),
    pagesImproved: v.number(),
    lastDocumentTitle: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_company", ["companyId"]),

  /**
   * What the staff flag but never settle (wiki-agents plan, phases 1-2):
   * two pages that disagree, or a claim a source no longer supports. Each
   * row is a question for a person; the machine's ceiling is raising it.
   * Deduplicated by key so the same disagreement is not raised nightly,
   * and auto-resolved when the pages change so the claim no longer stands.
   */
  wikiOpenQuestions: defineTable({
    companyId: v.optional(v.id("companies")),
    kind: v.union(
      v.literal("CONTRADICTION"),
      v.literal("FRESHNESS"),
      // A person's typed correction from chat, routed here once their
      // company's memories migrated (one-brain-plan.md, phase 3) — the
      // queue that used to live on the Memory screen.
      v.literal("CORRECTION"),
      // Judged worth filing while the Decision's mode says a person decides.
      v.literal("FILING")
    ),
    pageKeyA: v.string(),
    claimA: v.string(),
    pageKeyB: v.optional(v.string()),
    claimB: v.optional(v.string()),
    detail: v.optional(v.string()),
    dedupeKey: v.string(),
    status: v.union(v.literal("OPEN"), v.literal("RESOLVED"), v.literal("DISMISSED")),
    decisionKey: v.optional(v.string()),
    certainty: v.optional(decisionCertaintyValidator),
    raisedAt: v.number(),
    resolvedAt: v.optional(v.number()),
    resolvedBy: v.optional(v.id("users")),
  })
    .index("by_company_status", ["companyId", "status", "raisedAt"])
    .index("by_company_dedupe", ["companyId", "dedupeKey"]),

  /**
   * What the wiki could not answer (closing-the-loop plan, phase 1): a
   * real question that ended with no pages under it, normalised and
   * counted when it repeats. Every row is demand — a customer naming
   * what to feed the brain next. Rows resolve themselves when a later
   * identical asking gets answered with pages; dismissal is a person's
   * call and attribution lives in the audit trail, as with pins.
   */
  wikiUnansweredQuestions: defineTable({
    // Absent means the platform's own gap list (Anthony's SaaS ruling,
    // 2026-08-17): when the global brain was in play and still had no
    // answer, the miss also lands here — visible to super admins alone,
    // who can already read every company's chat logs. Company rows name
    // their company; platform rows count companies, never name them.
    companyId: v.optional(v.id("companies")),
    /** The first asking's own words, for the panel. */
    question: v.string(),
    normalizedKey: v.string(),
    askCount: v.number(),
    /** Platform rows only: distinct company ids that asked, capped. */
    companiesJson: v.optional(v.string()),
    status: v.union(v.literal("OPEN"), v.literal("DISMISSED"), v.literal("RESOLVED")),
    firstAskedAt: v.number(),
    lastAskedAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_company_status_asked", ["companyId", "status", "lastAskedAt"])
    .index("by_company_key", ["companyId", "normalizedKey"])
    .index("by_status_asked", ["status", "lastAskedAt"])
    .searchIndex("search_question", {
      searchField: "question",
      filterFields: ["status", "companyId"],
    }),

  /**
   * One row per company per UTC day (closing-the-loop plan, phase 3):
   * how many questions the wiki answered and how many it could not.
   * Written by the same after-answer mutation that keeps the usage
   * marks, so the weekly report counts real events, not estimates.
   */
  wikiAnswerTallies: defineTable({
    companyId: v.id("companies"),
    /** UTC day, "YYYY-MM-DD". */
    dayKey: v.string(),
    answered: v.number(),
    unanswered: v.number(),
  }).index("by_company_day", ["companyId", "dayKey"]),

  /**
   * A pre-ingest review (wiki-agents plan, phase 4): what a marked
   * document claims and the pages the Reviewer proposes, held for a
   * person's decision before the wiki learns anything from it.
   */
  wikiReviews: defineTable({
    companyId: v.optional(v.id("companies")),
    documentId: v.id("knowledgeDocuments"),
    title: v.string(),
    claimsJson: v.string(),
    status: v.union(v.literal("PENDING"), v.literal("APPROVED"), v.literal("REJECTED")),
    requestedAt: v.number(),
    decidedAt: v.optional(v.number()),
    decidedBy: v.optional(v.id("users")),
  })
    .index("by_company_status", ["companyId", "status", "requestedAt"])
    .index("by_document", ["documentId"]),

  /**
   * The page's walkable history (wiki plan, acceptance 4): the text as it
   * stood BEFORE each rewrite, and what caused the rewrite. Reading the
   * revisions in order shows which conversation taught which change.
   */
  wikiPageRevisions: defineTable({
    pageId: v.id("wikiPages"),
    companyId: v.optional(v.id("companies")),
    content: v.string(),
    source: v.string(),
    createdAt: v.number(),
  }).index("by_page", ["pageId", "createdAt"]),

  /**
   * A page's tags (Sonae's wiki-daily-checkup-plan.md, section 4). One row per page
   * and tag, so filtering by tag is an index read at any wiki size. A tag a
   * person added is marked, and the machine never removes it.
   */
  wikiPageTags: defineTable({
    companyId: v.optional(v.id("companies")),
    pageId: v.id("wikiPages"),
    tag: v.string(),
    byHuman: v.boolean(),
    addedAt: v.number(),
  })
    .index("by_company_tag", ["companyId", "tag"])
    .index("by_page", ["pageId"]),

  /**
   * One nightly check-up of one wiki: the nightly round or a hand-run "Fix this
   * wiki now". The row is the live progress bar while it runs and the Health
   * screen's record once done.
   */
  wikiCheckupRuns: defineTable({
    companyId: v.optional(v.id("companies")),
    trigger: v.union(v.literal("NIGHTLY"), v.literal("MANUAL")),
    /** SLICE is the night's share of the rota; FULL covers every page. */
    mode: v.union(v.literal("SLICE"), v.literal("FULL")),
    status: v.union(v.literal("RUNNING"), v.literal("SUCCESS"), v.literal("FAILED")),
    step: v.number(),
    stepKey: v.string(),
    doneUnits: v.number(),
    totalUnits: v.number(),
    /** Only ever rises; 100 exactly when the run has finished. */
    percent: v.number(),
    /** What the run has done so far, as JSON counts. */
    foundJson: v.string(),
    summary: v.optional(v.string()),
    error: v.optional(v.string()),
    notes: v.optional(v.array(v.string())),
    startedBy: v.optional(v.id("users")),
    startedAt: v.number(),
    updatedAt: v.number(),
    finishedAt: v.optional(v.number()),
  })
    .index("by_company_started", ["companyId", "startedAt"]),

  /**
   * A source document that changed or was removed, waiting for the wiki to
   * follow it (wiki-sonae-catch-up-plan-2026-11-21.md, 1.4). The old text is
   * kept here because a removed document's own copy is gone by the time its
   * facts are taken out of the pages it taught.
   */
  wikiSourceChanges: defineTable({
    companyId: v.optional(v.id("companies")),
    documentId: v.string(),
    kind: v.union(v.literal("CHANGED"), v.literal("REMOVED")),
    title: v.string(),
    oldContent: v.string(),
    newContent: v.optional(v.string()),
    pageIds: v.array(v.id("wikiPages")),
    status: v.union(v.literal("PENDING"), v.literal("DONE"), v.literal("FAILED")),
    attempts: v.number(),
    createdAt: v.number(),
    doneAt: v.optional(v.number()),
  })
    .index("by_company_status", ["companyId", "status", "createdAt"])
    .index("by_status", ["status", "createdAt"]),
};
