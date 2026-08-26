import { v } from "convex/values";
import { effectiveModulesFor } from "./tenantFunctions";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { tenantMutation, tenantQuery, type TenantMutationCtx } from "./tenantFunctions";
import { ensureAgentVersionSnapshot } from "./agentVersioningService";
import { getCurrentImport, preferredAccountCode, requireSalesDataCompany } from "./salesData";
import { extraFieldForType } from "./salesDataCustomerFields";
import { normalizeKey } from "./salesDataImportService";
import { matchDiscoveredSite, type KnownSite } from "./salesDataProspectMatching";
import { SALES_DATA_MODULE_KEY } from "./utils/salesDataModule";
import {
  RESEARCHABLE_FIELDS,
  type ResearchField,
  canonicalSourceUrl,
  isResearchField,
  isUsableSourceUrl,
  parseCount,
  researchIdempotencyKey,
  resolveSourceName,
  routeResearchFinding,
  truncateReasoning,
} from "./salesDataResearchService";
import {
  findCompletedToolCall,
  markReplayedResult,
  normalizeIdempotencyKey,
  recordCompletedToolCall,
} from "./aiToolIdempotencyService";
import { appError } from "./utils/appError";

/**
 * What the research agent is allowed to read and write.
 *
 * The narrowest pair of tools that can do the job: one that describes a
 * customer and says which details are missing, and one that records a single
 * finding. Neither takes a decision about what a finding is worth — that is
 * `salesDataResearchService`, in code, so it cannot be argued out of.
 *
 * Both are internal and take their company from the tool context rather than
 * from a signed-in person, because an agent run has no session. The module
 * check that `requireSalesDataCompany` performs for screens is repeated here
 * against the company it was handed, so an agent belonging to a workspace
 * without the section still cannot reach its data.
 */

const RESEARCH_HANDLER_MAPPING = "salesCustomers.research.record";

/**
 * How many accounts a search for the next customer will look at.
 *
 * The file seen holds 39. This is a bound on a scan that would otherwise grow
 * with the directory, and it is generous enough that reaching it means the
 * sweep is finished rather than truncated — a workspace with more than this
 * many customers gets them in directory order across repeated runs.
 */
const NEXT_CUSTOMER_SCAN_LIMIT = 500;

/** A customer's own research rows. Bounded by fields × findings, not by scale. */
const RESEARCH_ROWS_PER_SUBJECT_LIMIT = 200;

async function assertSalesDataCompany(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  companyId: Id<"companies">
) {
  const company = await ctx.db.get(companyId);
  if (!(await effectiveModulesFor(ctx, company)).includes(SALES_DATA_MODULE_KEY)) {
    throw appError("MODULE_DISABLED", "Sales Data is not enabled for this workspace.");
  }
}

type ResearchRow = Doc<"salesDataCustomerResearch">;

/** Every finding recorded about one customer, newest last. */
async function loadResearchRows(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  companyId: Id<"companies">,
  subjectKey: string
): Promise<ResearchRow[]> {
  return await ctx.db
    .query("salesDataCustomerResearch")
    .withIndex("by_company_subject_field", (q) =>
      q.eq("companyId", companyId).eq("subjectKey", subjectKey)
    )
    .take(RESEARCH_ROWS_PER_SUBJECT_LIMIT);
}

function detailValue(details: Doc<"salesDataCustomers"> | null, field: ResearchField) {
  if (!details) return undefined;
  const value = details[field];
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Which details this customer is still missing, and which have been looked for.
 *
 * The empty fields are listed outright rather than left to be inferred from
 * absent keys. A model handed a record with eleven missing keys fills in the
 * two it recognises and forgets the rest, so the gaps are stated as a list and
 * the ones already searched for and not published are stated separately — that
 * pair is what stops the same customer being researched for the same missing
 * phone number every month.
 */
function describeGaps(
  subject: { customerTypeKey: string },
  details: Doc<"salesDataCustomers"> | null,
  research: ResearchRow[]
) {
  const extraField = extraFieldForType(subject.customerTypeKey);
  const applicable = (Object.keys(RESEARCHABLE_FIELDS) as ResearchField[]).filter((field) => {
    if (field === "bedrooms" || field === "pupils") return extraField === field;
    return true;
  });

  const notFound = new Set(
    research.filter((row) => row.status === "NOT_FOUND").map((row) => row.field)
  );
  const parked = research.filter((row) => row.status === "NEEDS_CHECK");
  // A parked finding is a person's decision pending, not a gap. Counting it as
  // missing re-queued every customer with one on every job, and each re-visit
  // spent money to discover there was nothing to do.
  const parkedFields = new Set(parked.map((row) => row.field));

  const known: Record<string, string | number> = {};
  const missing: string[] = [];
  const alreadySearched: string[] = [];

  for (const field of applicable) {
    const value = detailValue(details, field);
    if (value !== undefined) {
      known[field] = value;
      continue;
    }
    if (notFound.has(field) || parkedFields.has(field)) {
      alreadySearched.push(field);
      continue;
    }
    missing.push(field);
  }

  const priorityMissing = extraField && missing.includes(extraField) ? [extraField] : [];
  const priorityNote =
    priorityMissing.length > 0
      ? `${extraField} is the key number for the opportunity report. Search it first, cite the page checked, and only mark it not found after checking the best source for this customer type.`
      : null;

  return {
    extraField,
    known,
    missing,
    alreadySearched,
    parkedCount: parked.length,
    priorityMissing,
    priorityNote,
  };
}

type ResearchGapDescription = ReturnType<typeof describeGaps>;

function hasSizePriorityGap(gaps: ResearchGapDescription): boolean {
  return gaps.priorityMissing.length > 0;
}

/** A run reads a bounded number of pages; its whole tool history fits in this. */
const RUN_TOOL_CALL_LIMIT = 200;

const PAGE_READ_HANDLER_MAPPING = "web.scrape";

/**
 * The pages this run actually read, as canonical addresses.
 *
 * The reason a cited source can be trusted. A model asked for the page a fact
 * came from will produce a plausible address, and a plausible address is not
 * the same thing as one it opened — the first live run cited
 * `allegracare.co.uk/our-homes/fairmile-grange`, which does not exist, for a
 * bed count it had read on `allegracare.co.uk/fairmile-grange`, which does.
 * The value happened to be right; the link a person would click to check it
 * was dead, which is the one thing the source is for.
 *
 * Checking reachability here would mean a mutation reaching the network, and
 * would still pass a live page the agent never opened. Matching against the
 * run's own successful fetches proves the stronger thing.
 */
async function pagesReadInRun(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  runId: Id<"agentRuns">
) {
  const calls = await ctx.db
    .query("agentToolCalls")
    .withIndex("by_run_started", (q) => q.eq("runId", runId))
    .take(RUN_TOOL_CALL_LIMIT);

  const pages = new Set<string>();
  for (const call of calls) {
    if (call.handlerMapping !== PAGE_READ_HANDLER_MAPPING) continue;
    if (call.status !== "SUCCESS") continue;
    try {
      const args = JSON.parse(call.argumentsJson) as { url?: unknown };
      const canonical = typeof args.url === "string" ? canonicalSourceUrl(args.url) : null;
      if (canonical) pages.add(canonical);
    } catch {
      // An unparseable record is not evidence of a read, so it is skipped
      // rather than treated as one.
    }
  }
  return pages;
}

async function loadDetailsRow(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  companyId: Id<"companies">,
  accountNameKey: string
) {
  return await ctx.db
    .query("salesDataCustomers")
    .withIndex("by_company_account", (q) =>
      q.eq("companyId", companyId).eq("accountNameKey", accountNameKey)
    )
    .unique();
}

/**
 * One customer to research.
 *
 * Called with an account it returns that one; called with nothing it returns
 * the next customer that still has gaps, which is what makes a sweep possible
 * without the objective carrying a list of thirty-nine names.
 */
export const readCustomerForResearch = internalQuery({
  args: {
    companyId: v.id("companies"),
    accountNameKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertSalesDataCompany(ctx, args.companyId);

    const currentImport = await getCurrentImport(ctx, args.companyId);
    if (!currentImport) {
      return {
        found: false as const,
        message: "This workspace has no imported sales data, so there are no customers to research.",
      };
    }

    const describe = async (subject: {
      subjectType: "CUSTOMER" | "PROSPECT";
      key: string;
      name: string;
      accountCode: string;
      groupName: string;
      customerType: string;
      customerTypeKey: string;
    }) => {
      const details = await loadDetailsRow(ctx, args.companyId, subject.key);
      const research = await loadResearchRows(ctx, args.companyId, subject.key);
      const gaps = describeGaps(subject, details, research);

      return {
        found: true as const,
        accountNameKey: subject.key,
        // The individual business. Everything about identifying the right site
        // hangs on the agent searching this and not the chain below it.
        accountName: subject.name,
        accountCode: subject.accountCode,
        // Present so two similarly named businesses can be told apart. It is
        // not a source: the chain's own address is never this customer's.
        groupName: subject.groupName,
        customerType: subject.customerType,
        // A prospect is a business the workspace does not yet supply. Said so
        // the agent does not describe it as a customer in its reply.
        subjectType: subject.subjectType,
        ...gaps,
      };
    };

    if (args.accountNameKey) {
      // Either kind: a prospect carries the same record and the same fields, so
      // "Find details" has to work on one.
      const subject = await resolveResearchSubject(ctx, {
        companyId: args.companyId,
        importId: currentImport._id,
        key: args.accountNameKey,
      });

      if (!subject) {
        return {
          found: false as const,
          message: `No customer or prospect called "${args.accountNameKey}" is on file.`,
        };
      }

      return await describe(subject);
    }

    // Both kinds, interleaved — see `orderResearchSubjects`.
    //
    // This scanned only customers, and hardcoded the answer's subject type to
    // CUSTOMER. The tool tells the agent it can be called with nothing to get
    // the next record needing work, so an agent taking that offer was told
    // "nothing left to research" while every prospect still had every field
    // empty. Prospects were reachable only by name, which only the sweep passes.
    const subjects = await collectResearchSubjects(ctx, {
      companyId: args.companyId,
      importId: currentImport._id,
    });

    let firstSubjectWithGaps:
      | {
          subjectType: "CUSTOMER" | "PROSPECT";
          key: string;
          name: string;
          accountCode: string;
          groupName: string;
          customerType: string;
          customerTypeKey: string;
        }
      | null = null;

    for (const subject of subjects) {
      const details = await loadDetailsRow(ctx, args.companyId, subject.key);
      const research = await loadResearchRows(ctx, args.companyId, subject.key);
      const gaps = describeGaps(subject, details, research);
      if (gaps.missing.length === 0) continue;
      if (hasSizePriorityGap(gaps)) {
        return await describe(subject);
      }
      firstSubjectWithGaps ??= subject;
    }

    if (firstSubjectWithGaps) return await describe(firstSubjectWithGaps);

    return {
      found: false as const,
      message:
        "Every customer and prospect has either been filled in or already searched. "
        + "There is nothing left to research.",
    };
  },
});

/**
 * Record one thing the agent found.
 *
 * The agent supplies the finding; this decides what becomes of it. A refusal
 * comes back as a readable reason rather than an exception because the agent is
 * meant to act on it — being told a bed count does not belong on a school is a
 * usable next step, where a failed tool call is not.
 */
export const recordResearchFinding = internalMutation({
  args: {
    companyId: v.id("companies"),
    accountNameKey: v.string(),
    field: v.string(),
    value: v.optional(v.string()),
    confidence: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    sourceName: v.optional(v.string()),
    reasoning: v.optional(v.string()),
    notFound: v.optional(v.boolean()),
    agentId: v.optional(v.id("agents")),
    actorId: v.optional(v.id("users")),
    runId: v.optional(v.id("agentRuns")),
    toolCallId: v.optional(v.id("agentToolCalls")),
  },
  handler: async (ctx, args) => {
    await assertSalesDataCompany(ctx, args.companyId);

    const currentImport = await getCurrentImport(ctx, args.companyId);
    if (!currentImport) {
      return { recorded: false as const, reason: "This workspace has no imported sales data." };
    }

    const subject = await resolveResearchSubject(ctx, {
      companyId: args.companyId,
      importId: currentImport._id,
      key: args.accountNameKey,
    });

    if (!subject) {
      return {
        recorded: false as const,
        reason: `No customer or prospect called "${args.accountNameKey}" is on file.`,
      };
    }

    const now = Date.now();
    const value = args.value ?? "";

    // Keyed on customer, field and value: the same number reported twice for the
    // same field is one finding arriving twice, whichever run carried it.
    const idempotencyKey = normalizeIdempotencyKey(
      researchIdempotencyKey({
        subjectKey: args.accountNameKey,
        field: args.field,
        value,
        notFound: args.notFound,
      })
    );

    if (idempotencyKey) {
      const completed = await findCompletedToolCall(ctx, {
        companyId: args.companyId,
        handlerMapping: RESEARCH_HANDLER_MAPPING,
        idempotencyKey,
        now,
      });

      if (completed) {
        try {
          return markReplayedResult(JSON.parse(completed.resultJson) as unknown);
        } catch {
          // A record that cannot be read is no basis for skipping the write, but
          // the write below is not a set-to-a-value — it inserts a row. Fall
          // through and let it insert: a duplicate finding is visible and
          // discardable, where a silently dropped one is not.
        }
      }
    }

    const details = await loadDetailsRow(ctx, args.companyId, args.accountNameKey);
    const extraFieldForCustomer = extraFieldForType(subject.customerTypeKey);

    const decision = routeResearchFinding({
      field: args.field,
      value,
      confidence: args.confidence ?? "",
      sourceUrl: args.sourceUrl,
      notFound: args.notFound,
      fieldHasValue:
        detailValue(details, args.field as ResearchField) !== undefined,
      extraFieldForCustomer,
    });

    if (!decision.ok) {
      // Nothing is stored for a refusal. A row the agent was told to correct
      // would otherwise sit in the review queue as though a person had to look
      // at it.
      return { recorded: false as const, reason: decision.reason };
    }

    // The cited page has to be one this run opened. See `pagesReadInRun`: a
    // plausible address is not evidence, and a finding whose source cannot be
    // clicked is worth less than no finding at all.
    if (decision.status === "NOT_FOUND" && args.runId && decision.field === extraFieldForCustomer) {
      const pagesRead = await pagesReadInRun(ctx, args.runId);
      const cited = canonicalSourceUrl(args.sourceUrl);
      if (pagesRead.size === 0 || !cited || !pagesRead.has(cited)) {
        return {
          recorded: false as const,
          reason:
            `${decision.field} is the key number for the opportunity report. `
            + "Before marking it not found, cite the exact page you checked in this run.",
        };
      }
    }

    if (decision.status !== "NOT_FOUND" && args.runId) {
      const pagesRead = await pagesReadInRun(ctx, args.runId);
      const cited = canonicalSourceUrl(args.sourceUrl);
      if (pagesRead.size > 0 && (!cited || !pagesRead.has(cited))) {
        return {
          recorded: false as const,
          reason:
            `You have not read ${args.sourceUrl} in this run, so it cannot be the source. `
            + "Cite the exact address you fetched, or fetch the page you are citing.",
        };
      }
    }

    const sourceUrl = args.sourceUrl?.trim();
    const row = {
      companyId: args.companyId,
      subjectKey: subject.key,
      subjectType: subject.subjectType,
      field: decision.field,
      value: decision.value,
      confidence: decision.confidence,
      status: decision.status,
      ...(sourceUrl ? { sourceUrl, sourceName: resolveSourceName(args.sourceName, sourceUrl) } : {}),
      ...(truncateReasoning(args.reasoning) ? { reasoning: truncateReasoning(args.reasoning) } : {}),
      ...(args.runId ? { runId: args.runId } : {}),
      ...(args.agentId ? { agentId: args.agentId } : {}),
      foundAt: now,
    };

    const researchId = await ctx.db.insert("salesDataCustomerResearch", row);

    if (decision.status === "APPLIED" && decision.writeValue !== undefined) {
      await writeCustomerField(ctx, {
        companyId: args.companyId,
        accountNameKey: args.accountNameKey,
        field: decision.field,
        value: decision.writeValue,
        details,
        // An agent's write still needs an author. The person who started the run
        // is the closest honest answer, and it is what the profile shows.
        actorId: args.actorId,
        now,
      });
    }

    const result = {
      recorded: true as const,
      researchId,
      field: decision.field,
      status: decision.status,
      message: describeOutcome(decision.status, decision.field),
    };

    if (idempotencyKey) {
      await recordCompletedToolCall(ctx, {
        companyId: args.companyId,
        handlerMapping: RESEARCH_HANDLER_MAPPING,
        idempotencyKey,
        resultJson: JSON.stringify(result),
        runId: args.runId,
        toolCallId: args.toolCallId,
        now,
      });
    }

    return result;
  },
});

/** Said in the agent's terms, so it knows whether to move on or to try again. */
function describeOutcome(status: string, field: string) {
  if (status === "APPLIED") return `Saved. ${field} is now on the customer record.`;
  if (status === "NOT_FOUND") {
    return `Noted that ${field} is not published. It will not be searched for again.`;
  }
  return `Recorded for a person to check. ${field} on the record is unchanged.`;
}

/**
 * Write a confident finding onto the customer record.
 *
 * Goes through the same shape the typed-in save uses — the row is created on
 * first write, values are trimmed, and the two figures are numbers — so a
 * researched postcode is stored exactly as a typed one is and the profile
 * cannot tell them apart. Where it came from is the research row's job.
 */
async function writeCustomerField(
  ctx: Pick<MutationCtx, "db">,
  args: {
    companyId: Id<"companies">;
    accountNameKey: string;
    field: ResearchField;
    /** `undefined` clears the field, which is what "not right" does. */
    value: string | number | undefined;
    /** Read already, when the caller has it. Looked up when it does not. */
    details?: Doc<"salesDataCustomers"> | null;
    actorId?: Id<"users">;
    now: number;
  }
) {
  const patch = { [args.field]: args.value, updatedAt: args.now };
  const details =
    args.details !== undefined
      ? args.details
      : await loadDetailsRow(ctx, args.companyId, args.accountNameKey);

  if (details) {
    await ctx.db.patch(details._id, {
      ...patch,
      ...(args.actorId ? { updatedBy: args.actorId } : {}),
    });
    return;
  }

  // Nothing to clear on a record that does not exist yet.
  if (args.value === undefined) return;

  // The row is created on first write, as the typed-in save creates it, so a
  // directory of empty records never exists. It cannot be created without an
  // author, which is why a run with no person behind it parks instead.
  if (!args.actorId) return;

  await ctx.db.insert("salesDataCustomers", {
    companyId: args.companyId,
    accountNameKey: args.accountNameKey,
    ...patch,
    updatedBy: args.actorId,
  } as Omit<Doc<"salesDataCustomers">, "_id" | "_creationTime">);
}

/**
 * What the research agent has to say about one customer, for their profile.
 *
 * Two lists, because the screen shows them in two places. `applied` is the
 * provenance behind filled fields — the marker under a value saying where it
 * came from. `needsCheck` is the queue: findings a person has to accept or
 * discard, either because the agent was not certain or because they contradict
 * something already typed in.
 *
 * Rejected, superseded and not-found rows are deliberately absent. They are
 * history, and the profile is not a log.
 */
export const listCustomerResearch = tenantQuery({
  args: { accountNameKey: v.string() },
  handler: async (ctx, args) => {
    const companyId = await requireSalesDataCompany(ctx);
    const rows = await loadResearchRows(ctx, companyId, args.accountNameKey);

    const shown = (row: ResearchRow) => ({
      id: row._id,
      field: row.field,
      value: row.value,
      confidence: row.confidence,
      sourceUrl: row.sourceUrl ?? null,
      sourceName: row.sourceName ?? null,
      reasoning: row.reasoning ?? null,
      foundAt: row.foundAt,
    });

    return {
      applied: rows.filter((row) => row.status === "APPLIED").map(shown),
      // Oldest first, so a queue somebody works through reads in the order it
      // arrived rather than newest-shouting-loudest.
      needsCheck: rows
        .filter((row) => row.status === "NEEDS_CHECK")
        .sort((first, second) => first.foundAt - second.foundAt)
        .map(shown),
    };
  },
});

/**
 * The business behind a key, for the agent's tools.
 *
 * A prospect carries the same record as a customer, so the research tools have
 * to reach one: without this, "Find details" on a prospect fails with "not in
 * the current import" and the button on its profile does nothing.
 */
/** One thing that can be researched, whichever table it came from. */
type ResearchSubject = {
  subjectType: "CUSTOMER" | "PROSPECT";
  key: string;
  name: string;
  accountCode: string;
  groupName: string;
  customerType: string;
  customerTypeKey: string;
};

/**
 * Every customer and prospect worth researching, in the order they get worked.
 *
 * Interleaved rather than all customers then all prospects. Both the sweep and
 * the agent's own "give me the next one" stop early — the sweep at sixty queued
 * runs, the agent at the first record with a gap — so whichever kind is listed
 * first is the only kind that gets done. Every customer came first, so prospects
 * were reached only on a press where the customers happened to be complete, and
 * a workspace with steady customer gaps would never have researched a prospect
 * at all.
 *
 * Alternating means both halves advance on every press. It costs nothing: the
 * work per record is the same whichever order they arrive in.
 */
function orderResearchSubjects(
  customers: ResearchSubject[],
  prospects: ResearchSubject[]
): ResearchSubject[] {
  const ordered: ResearchSubject[] = [];
  for (let index = 0; index < Math.max(customers.length, prospects.length); index += 1) {
    if (index < customers.length) ordered.push(customers[index]);
    if (index < prospects.length) ordered.push(prospects[index]);
  }
  return ordered;
}

/**
 * Read both halves of the list.
 *
 * `DISMISSED` and `CONVERTED` prospects are left out: one was rejected by hand
 * and the other is a customer now, already in the first half.
 */
async function collectResearchSubjects(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  args: { companyId: Id<"companies">; importId: Id<"salesDataImports"> }
): Promise<ResearchSubject[]> {
  const accounts = await ctx.db
    .query("salesDataAccounts")
    .withIndex("by_company_import_group_name", (q) =>
      q.eq("companyId", args.companyId).eq("importId", args.importId)
    )
    .take(NEXT_CUSTOMER_SCAN_LIMIT);

  const prospects = await ctx.db
    .query("salesDataProspects")
    .withIndex("by_company_status", (q) =>
      q.eq("companyId", args.companyId).eq("status", "NEW")
    )
    .take(NEXT_CUSTOMER_SCAN_LIMIT);

  return orderResearchSubjects(
    accounts.map((account) => ({
      subjectType: "CUSTOMER" as const,
      key: account.accountNameKey,
      name: account.accountName,
      accountCode: preferredAccountCode(account.codeTally),
      groupName: account.groupName,
      customerType: account.customerType,
      customerTypeKey: account.customerTypeKey,
    })),
    prospects.map((prospect) => ({
      subjectType: "PROSPECT" as const,
      key: prospect.prospectKey,
      name: prospect.siteName,
      accountCode: "",
      groupName: prospect.groupName,
      customerType: prospect.customerType,
      customerTypeKey: prospect.customerTypeKey,
    }))
  );
}

async function resolveResearchSubject(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  args: { companyId: Id<"companies">; importId: Id<"salesDataImports">; key: string }
) {
  const account = await ctx.db
    .query("salesDataAccounts")
    .withIndex("by_company_import_account", (q) =>
      q.eq("companyId", args.companyId).eq("importId", args.importId).eq("accountNameKey", args.key)
    )
    .unique();

  if (account) {
    return {
      subjectType: "CUSTOMER" as const,
      key: account.accountNameKey,
      name: account.accountName,
      accountCode: preferredAccountCode(account.codeTally),
      groupName: account.groupName,
      customerType: account.customerType,
      customerTypeKey: account.customerTypeKey,
    };
  }

  const prospect = await ctx.db
    .query("salesDataProspects")
    .withIndex("by_company_prospect", (q) =>
      q.eq("companyId", args.companyId).eq("prospectKey", args.key)
    )
    .unique();

  if (!prospect || prospect.status === "DISMISSED") return null;

  return {
    subjectType: "PROSPECT" as const,
    key: prospect.prospectKey,
    name: prospect.siteName,
    accountCode: "",
    groupName: prospect.groupName,
    customerType: prospect.customerType,
    customerTypeKey: prospect.customerTypeKey,
  };
}

type ClaimedProspectingChain =
  | { state: "CLAIMED"; groupNameKey: string; groupName: string }
  | { state: "NEEDS_TASK" };

/**
 * Which chain this run is allowed to prospect, if it is working a job.
 *
 * A prospecting run has two ways to name a group: the queue item it claimed, and
 * the argument it passes to the group/prospect tools. The queue is the authority.
 * Without this, a no-name "read a group" call can drift to some other group
 * while the job still shows the claimed chain as in progress.
 */
async function claimedProspectingChainForRun(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  args: { companyId: Id<"companies">; runId?: Id<"agentRuns"> }
): Promise<ClaimedProspectingChain | null> {
  if (!args.runId) return null;

  const job = await ctx.db
    .query("salesDataResearchJobs")
    .withIndex("by_company_status", (q) =>
      q.eq("companyId", args.companyId).eq("status", "RUNNING")
    )
    .first();
  if (!job) return null;

  const inProgress = await ctx.db
    .query("salesDataResearchJobItems")
    .withIndex("by_job_status", (q) => q.eq("jobId", job._id).eq("status", "IN_PROGRESS"))
    .take(NEXT_CUSTOMER_SCAN_LIMIT);

  const claimed = inProgress.find(
    (item) => item.kind === "CHAIN" && item.runId === args.runId
  );
  if (claimed) {
    return { state: "CLAIMED", groupNameKey: claimed.key, groupName: claimed.label };
  }

  if (job.currentRunId === args.runId) return { state: "NEEDS_TASK" };
  return null;
}

/**
 * A group to go looking through, and the sites in it already supplied.
 *
 * Called with nothing it returns the next group that has not been enumerated
 * yet, which is what lets one standing objective sweep every group without the
 * instruction carrying a list of names.
 */
export const readGroupForProspecting = internalQuery({
  args: {
    companyId: v.id("companies"),
    groupName: v.optional(v.string()),
    runId: v.optional(v.id("agentRuns")),
  },
  handler: async (ctx, args) => {
    await assertSalesDataCompany(ctx, args.companyId);

    const currentImport = await getCurrentImport(ctx, args.companyId);
    if (!currentImport) {
      return { found: false as const, message: "This workspace has no imported sales data." };
    }

    const claimed = await claimedProspectingChainForRun(ctx, {
      companyId: args.companyId,
      runId: args.runId,
    });
    const requestedGroupNameKey = args.groupName ? normalizeKey(args.groupName) : null;

    if (claimed?.state === "NEEDS_TASK") {
      return {
        found: false as const,
        message: "Ask for your next prospecting task before reading a group.",
      };
    }

    const accounts = await ctx.db
      .query("salesDataAccounts")
      .withIndex("by_company_import_group_name", (q) =>
        q.eq("companyId", args.companyId).eq("importId", currentImport._id)
      )
      .take(NEXT_CUSTOMER_SCAN_LIMIT);

    const groups = new Map<string, Doc<"salesDataAccounts">[]>();
    for (const account of accounts) {
      groups.set(account.groupNameKey, [...(groups.get(account.groupNameKey) ?? []), account]);
    }

    const describe = async (members: Doc<"salesDataAccounts">[]) => {
      const found = await ctx.db
        .query("salesDataProspects")
        .withIndex("by_company_group", (q) =>
          q.eq("companyId", args.companyId).eq("groupNameKey", members[0].groupNameKey)
        )
        .take(NEXT_CUSTOMER_SCAN_LIMIT);

      return {
        found: true as const,
        groupName: members[0].groupName,
        customerType: members[0].customerType,
        /** What the workspace already supplies. Do not report these as new. */
        supplied: members.map((member) => member.accountName),
        /** Already found by an earlier run. Nor these. */
        alreadyFound: found.map((prospect) => prospect.siteName),
      };
    };

    if (claimed?.state === "CLAIMED") {
      if (requestedGroupNameKey && requestedGroupNameKey !== claimed.groupNameKey) {
        return {
          found: false as const,
          message:
            `Your current prospecting task is "${claimed.groupName}". `
            + "Read that group before moving on.",
        };
      }

      const members = groups.get(claimed.groupNameKey);
      if (!members) {
        return {
          found: false as const,
          message:
            `"${claimed.groupName}" is not a group this workspace supplies in the current import.`,
        };
      }
      return await describe(members);
    }

    if (args.groupName) {
      const members = groups.get(normalizeKey(args.groupName));
      if (!members) {
        return {
          found: false as const,
          message: `"${args.groupName}" is not a group this workspace supplies.`,
        };
      }
      return await describe(members);
    }

    for (const members of groups.values()) {
      const found = await ctx.db
        .query("salesDataProspects")
        .withIndex("by_company_group", (q) =>
          q.eq("companyId", args.companyId).eq("groupNameKey", members[0].groupNameKey)
        )
        .first();
      if (!found) return await describe(members);
    }

    return {
      found: false as const,
      message: "Every group in the current import has already been looked through.",
    };
  },
});

/**
 * Every business in this workspace the prospecting half must not re-report.
 *
 * Both sides of it: the accounts in the current import, and the prospects
 * already found. A run that re-reported the six Colten Care homes it was told
 * about, or the fifteen it found last month, would look like it was working.
 */
async function loadKnownSites(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  args: { companyId: Id<"companies">; importId: Id<"salesDataImports">; groupNameKey: string }
): Promise<KnownSite[]> {
  const accounts = await ctx.db
    .query("salesDataAccounts")
    .withIndex("by_company_import_group_name", (q) =>
      q
        .eq("companyId", args.companyId)
        .eq("importId", args.importId)
        .eq("groupNameKey", args.groupNameKey)
    )
    .take(NEXT_CUSTOMER_SCAN_LIMIT);

  const known: KnownSite[] = [];
  for (const account of accounts) {
    const details = await loadDetailsRow(ctx, args.companyId, account.accountNameKey);
    known.push({
      key: account.accountNameKey,
      name: account.accountName,
      groupName: account.groupName,
      ...(details?.postcode ? { postcode: details.postcode } : {}),
    });
  }

  const prospects = await ctx.db
    .query("salesDataProspects")
    .withIndex("by_company_group", (q) =>
      q.eq("companyId", args.companyId).eq("groupNameKey", args.groupNameKey)
    )
    .take(NEXT_CUSTOMER_SCAN_LIMIT);

  for (const prospect of prospects) {
    known.push({
      key: prospect.prospectKey,
      name: prospect.siteName,
      groupName: prospect.groupName,
      ...(prospect.postcode ? { postcode: prospect.postcode } : {}),
    });
  }

  return known;
}

/**
 * Record a site the agent found in a group the workspace already supplies.
 *
 * The agent reports every site it finds, including ones it believes are already
 * supplied — that is not wasted work, it is how the coverage count stays
 * honest. Which of them is news is decided here, by the matching rules, and the
 * agent is told the answer so it stops re-reporting the same six homes.
 */
export const recordProspect = internalMutation({
  args: {
    companyId: v.id("companies"),
    groupName: v.string(),
    siteName: v.string(),
    town: v.optional(v.string()),
    postcode: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    sourceName: v.optional(v.string()),
    reasoning: v.optional(v.string()),
    agentId: v.optional(v.id("agents")),
    runId: v.optional(v.id("agentRuns")),
    toolCallId: v.optional(v.id("agentToolCalls")),
  },
  handler: async (ctx, args) => {
    await assertSalesDataCompany(ctx, args.companyId);

    const currentImport = await getCurrentImport(ctx, args.companyId);
    if (!currentImport) {
      return { recorded: false as const, reason: "This workspace has no imported sales data." };
    }

    const siteName = args.siteName.trim();
    if (!siteName) {
      return { recorded: false as const, reason: "Give the site's name as the source publishes it." };
    }
    if (!isUsableSourceUrl(args.sourceUrl)) {
      return {
        recorded: false as const,
        reason:
          "Every site needs the web address of the page that lists it. "
          + "If you cannot name the page, you have not found the site.",
      };
    }

    const groupNameKey = normalizeKey(args.groupName);
    const claimed = await claimedProspectingChainForRun(ctx, {
      companyId: args.companyId,
      runId: args.runId,
    });
    if (claimed?.state === "NEEDS_TASK") {
      return {
        recorded: false as const,
        reason: "Ask for your next prospecting task before recording a site.",
      };
    }
    if (claimed?.state === "CLAIMED" && groupNameKey !== claimed.groupNameKey) {
      return {
        recorded: false as const,
        reason:
          `Your current prospecting task is "${claimed.groupName}". `
          + "Record sites for that group only.",
      };
    }

    // The group has to be one the workspace already sells to. Searching groups
    // it has never dealt with is a different product with a different cost, and
    // this is that decision enforced in code rather than in the prompt.
    const groupMember = await ctx.db
      .query("salesDataAccounts")
      .withIndex("by_company_import_group_name", (q) =>
        q
          .eq("companyId", args.companyId)
          .eq("importId", currentImport._id)
          .eq("groupNameKey", groupNameKey)
      )
      .first();

    if (!groupMember) {
      return {
        recorded: false as const,
        reason:
          `"${args.groupName}" is not a group this workspace supplies. `
          + "Only groups already in the sales data are researched.",
      };
    }

    const known = await loadKnownSites(ctx, {
      companyId: args.companyId,
      importId: currentImport._id,
      groupNameKey,
    });

    const match = matchDiscoveredSite(
      {
        siteName,
        groupName: args.groupName,
        ...(args.postcode ? { postcode: args.postcode } : {}),
      },
      known
    );

    if (match.outcome === "KNOWN") {
      // Said plainly so the agent stops offering it. A silent no-op reads as a
      // success and the same site comes back on the next run.
      return {
        recorded: false as const,
        alreadyKnown: true as const,
        matched: match.matched.name,
        reason: `${siteName} is already on file as "${match.matched.name}".`,
      };
    }

    const sourceUrl = args.sourceUrl.trim();
    const prospectId = await ctx.db.insert("salesDataProspects", {
      companyId: args.companyId,
      prospectKey: normalizeKey(siteName),
      siteName,
      groupName: groupMember.groupName,
      groupNameKey,
      // Taken from the group's existing members rather than guessed, so the
      // extra-figure rule applies to a prospect exactly as to a customer.
      customerType: groupMember.customerType,
      customerTypeKey: groupMember.customerTypeKey,
      ...(args.town?.trim() ? { town: args.town.trim() } : {}),
      ...(args.postcode?.trim() ? { postcode: args.postcode.trim() } : {}),
      status: "NEW" as const,
      ...(match.outcome === "CONFLICT" ? { conflictNote: match.note } : {}),
      sourceUrl,
      sourceName: resolveSourceName(args.sourceName, sourceUrl),
      ...(truncateReasoning(args.reasoning) ? { reasoning: truncateReasoning(args.reasoning) } : {}),
      ...(args.runId ? { runId: args.runId } : {}),
      ...(args.agentId ? { agentId: args.agentId } : {}),
      foundAt: Date.now(),
    });

    return {
      recorded: true as const,
      prospectId,
      // Returned so the research job can put this site straight onto its own
      // queue: a prospect found at half past two is researched by the same job
      // rather than waiting for a second press.
      prospectKey: normalizeKey(siteName),
      conflict: match.outcome === "CONFLICT",
      message:
        match.outcome === "CONFLICT"
          ? `Filed as a prospect, flagged for a person: ${match.note}`
          : `Filed as a prospect in ${groupMember.groupName}.`,
    };
  },
});

/**
 * One prospect, for its profile.
 *
 * Returns null rather than throwing when there is no such prospect, so the
 * profile screen can ask about any account key and use the answer to decide
 * which kind of record it is looking at.
 */
export const getProspect = tenantQuery({
  args: { prospectKey: v.string() },
  handler: async (ctx, args) => {
    const companyId = await requireSalesDataCompany(ctx);
    const prospect = await ctx.db
      .query("salesDataProspects")
      .withIndex("by_company_prospect", (q) =>
        q.eq("companyId", companyId).eq("prospectKey", args.prospectKey)
      )
      .unique();

    if (!prospect) return null;

    return {
      prospectKey: prospect.prospectKey,
      siteName: prospect.siteName,
      groupName: prospect.groupName,
      customerType: prospect.customerType,
      town: prospect.town ?? null,
      postcode: prospect.postcode ?? null,
      status: prospect.status,
      conflictNote: prospect.conflictNote ?? null,
      sourceUrl: prospect.sourceUrl ?? null,
      sourceName: prospect.sourceName ?? null,
      reasoning: prospect.reasoning ?? null,
      origin: prospect.origin ?? "EXISTING_CHAIN",
      foundAt: prospect.foundAt,
    };
  },
});

/**
 * The other sites in a group, and which of them the workspace supplies.
 *
 * Deliberately two lists rather than a ratio. Whether "you supply 6 of 21" is
 * the right reading depends on how the group buys — Colten Care's accounts in
 * the workbook are Housekeeping, Nursing, Kitchen and Uniform, so it buys
 * centrally and the nineteen homes are not gaps in coverage at all. A figure
 * that asserted otherwise would be confidently wrong on the first group
 * somebody looked at, so the screen shows the sites and leaves the reading to
 * a person.
 */
export const listGroupProspects = tenantQuery({
  args: { groupName: v.string() },
  handler: async (ctx, args) => {
    const companyId = await requireSalesDataCompany(ctx);
    const groupNameKey = normalizeKey(args.groupName);

    const prospects = await ctx.db
      .query("salesDataProspects")
      .withIndex("by_company_group", (q) =>
        q.eq("companyId", companyId).eq("groupNameKey", groupNameKey)
      )
      .take(NEXT_CUSTOMER_SCAN_LIMIT);

    return prospects
      .filter((prospect) => prospect.status === "NEW")
      .map((prospect) => ({
        prospectKey: prospect.prospectKey,
        siteName: prospect.siteName,
        town: prospect.town ?? null,
      }));
  },
});

/**
 * Not interested.
 *
 * Kept rather than deleted, so the same site is not re-reported next month by
 * a run that has no memory of the decision.
 */
export const dismissProspect = tenantMutation({
  args: { prospectKey: v.string() },
  handler: async (ctx, args) => {
    const companyId = await requireSalesDataCompany(ctx);
    const prospect = await ctx.db
      .query("salesDataProspects")
      .withIndex("by_company_prospect", (q) =>
        q.eq("companyId", companyId).eq("prospectKey", args.prospectKey)
      )
      .unique();

    if (!prospect) throw appError("UNAUTHORIZED", "That prospect is not in this workspace.");
    if (prospect.status === "CONVERTED") {
      throw appError("CONFLICT", "That site is a customer now, so it cannot be dismissed.");
    }

    await ctx.db.patch(prospect._id, {
      status: "DISMISSED",
      decidedBy: ctx.userId,
      decidedAt: Date.now(),
    });

    return { status: "DISMISSED" as const };
  },
});

/**
 * The connector whose tools make an agent a research agent.
 *
 * The agent is found by what it can do, not by what it is called. The Rightmove
 * precedent matches on a hardcoded name, which would put a client's name in
 * platform code and stop the next client naming their agent anything else. This
 * asks the only question that actually matters: which active agent in this
 * workspace has been given the customer research tools?
 */
const RESEARCH_CONNECTOR_KEY = "sales-customer-research";

/** Enough to cover a workspace's agents without scanning the whole platform's. */
const AGENT_BINDING_LOOKUP_LIMIT = 200;

/**
 * How far apart the sweep's runs are started.
 *
 * Thirty-nine runs fired at once would hit the model provider as a burst and
 * compete for the same budget. Spread out, the waterfall is also readable —
 * they finish in the order they were queued rather than interleaved.
 */
const SWEEP_STAGGER_MS = 4_000;

/** One press of the button is a sweep, not an open tab. */
const SWEEP_MAX_RUNS = 60;

/**
 * The agent bound to one of the research tools, by the tool's handler.
 *
 * Which agent does a job's work is decided by tool bindings, not by name:
 * the agent holding the detail-recording tool is the record filler, and the
 * agent holding the site-filing tool is the prospect finder. One agent
 * holding both is a workspace that has not split the skills, and that is a
 * supported shape, not an error.
 */
async function resolveAgentBoundTo(
  ctx: Pick<TenantMutationCtx, "db">,
  companyId: Id<"companies">,
  handlerMapping: string
) {
  const tools = await ctx.db
    .query("aiTools")
    .withIndex("by_connector_key", (q) => q.eq("connectorKey", RESEARCH_CONNECTOR_KEY))
    .take(AGENT_BINDING_LOOKUP_LIMIT);

  if (tools.length === 0) {
    throw appError("NOT_CONFIGURED", "The customer research tools are not set up on this deployment yet.");
  }

  for (const tool of tools) {
    if (tool.handlerMapping !== handlerMapping) continue;
    const bindings = await ctx.db
      .query("agentTools")
      .withIndex("by_tool", (q) => q.eq("toolId", tool._id))
      .take(AGENT_BINDING_LOOKUP_LIMIT);

    for (const binding of bindings) {
      const agent = await ctx.db.get(binding.agentId);
      if (!agent || agent.isActive === false) continue;
      // A global agent serves any workspace; a tenant's own agent serves only
      // theirs. Either is fine, another workspace's is not.
      if (agent.companyId && agent.companyId !== companyId) continue;
      return agent;
    }
  }

  return null;
}

async function resolveResearchAgent(ctx: TenantMutationCtx, companyId: Id<"companies">) {
  const agent = await resolveAgentBoundTo(ctx, companyId, "salesCustomers.research.record");
  if (agent) return agent;

  throw appError("NOT_CONFIGURED", "No active agent in this workspace has the customer research tools switched on. "
      + "Add them to an agent under its Interfaces screen, then try again.");
}

/**
 * Both of the job's workers: the record filler, and the prospect finder.
 *
 * The finder falls back to the filler when no second agent holds the
 * site-filing tool, so a workspace with one agent keeps today's behaviour
 * and a workspace that has split the skills gets the split without a
 * setting anywhere.
 */
export async function resolveResearchWorkers(
  ctx: Pick<TenantMutationCtx, "db">,
  companyId: Id<"companies">
) {
  const filler = await resolveAgentBoundTo(ctx, companyId, "salesCustomers.research.record");
  if (!filler) {
    throw appError("NOT_CONFIGURED", "No active agent in this workspace has the customer research tools switched on. "
        + "Add them to an agent under its Interfaces screen, then try again.");
  }
  const finder = await resolveAgentBoundTo(ctx, companyId, "salesCustomers.prospects.record");
  return { filler, finder: finder ?? filler };
}

function buildResearchObjective(accountNameKey: string) {
  return [
    `Research the customer whose account name key is exactly ${accountNameKey}.`,
    "Pass that exact account name key to the read tool, and fill in what you can be sure of.",
  ].join(" ");
}

async function queueResearchRun(
  ctx: TenantMutationCtx,
  args: {
    agent: Doc<"agents">;
    companyId: Id<"companies">;
    accountNameKey: string;
    delayMs: number;
    now: number;
  }
) {
  const objective = buildResearchObjective(args.accountNameKey);
  const agentVersionId = await ensureAgentVersionSnapshot(ctx, {
    agentId: args.agent._id,
    companyId: args.companyId,
  });

  const agentRunId = await ctx.db.insert("agentRuns", {
    agentId: args.agent._id,
    agentVersionId,
    triggerType: "MANUAL",
    objective,
    title: `${args.accountNameKey} · fill in details`,
    status: "QUEUED",
    companyId: args.companyId,
    userId: ctx.userId,
    startedAt: args.now,
    updatedAt: args.now,
  });

  await ctx.scheduler.runAfter(args.delayMs, internal.agentRuntime.runTriggeredAgentObjective, {
    agentId: args.agent._id,
    objective,
    triggerType: "MANUAL",
    runId: agentRunId,
    companyId: args.companyId,
    userId: ctx.userId,
  });

  return agentRunId;
}

/** Research one customer, from the button on their profile. */
export const startCustomerResearch = tenantMutation({
  args: { accountNameKey: v.string() },
  handler: async (ctx, args) => {
    const companyId = await requireSalesDataCompany(ctx);
    const currentImport = await getCurrentImport(ctx, companyId);
    if (!currentImport) throw appError("NOT_FOUND", "There is no imported data to research against.");

    const subject = await resolveResearchSubject(ctx, {
      companyId,
      importId: currentImport._id,
      key: args.accountNameKey,
    });
    if (!subject) throw appError("UNAUTHORIZED", "That record is not in this workspace.");

    const agent = await resolveResearchAgent(ctx, companyId);
    const agentRunId = await queueResearchRun(ctx, {
      agent,
      companyId,
      accountNameKey: subject.key,
      delayMs: 0,
      now: Date.now(),
    });

    return { agentRunId, queued: 1 };
  },
});

/**
 * Everything in this workspace that still needs researching, as a work list.
 *
 * Exported for the research job, which needs the same "what is still missing"
 * judgement the sweeps used but has to write it down as a queue rather than act
 * on it immediately. The gap rules stay here, next to the fields they are about,
 * rather than being reimplemented against the same tables somewhere else.
 *
 * Prospects on the books with gaps are returned as their own list: the
 * detail-filling job researches them alongside customers — one skill, two
 * subject kinds — while prospects a chain pass is *about* to find join the
 * queue as they are filed.
 */
export async function collectPendingResearchWork(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  args: { companyId: Id<"companies">; importId: Id<"salesDataImports"> }
): Promise<{
  customers: { key: string; label: string }[];
  chains: { key: string; label: string }[];
  prospects: { key: string; label: string }[];
}> {
  const subjects = await collectResearchSubjects(ctx, args);

  const customers: Array<{ key: string; label: string; priority: boolean }> = [];
  const prospects: Array<{ key: string; label: string; priority: boolean }> = [];
  for (const subject of subjects) {
    const details = await loadDetailsRow(ctx, args.companyId, subject.key);
    const research = await loadResearchRows(ctx, args.companyId, subject.key);
    // Already filled in, or every remaining gap already searched for and found
    // unpublished. Either way there is nothing to spend money on.
    const gaps = describeGaps(subject, details, research);
    if (gaps.missing.length === 0) continue;
    (subject.subjectType === "CUSTOMER" ? customers : prospects)
      .push({
        key: subject.key,
        label: subject.name,
        priority: hasSizePriorityGap(gaps),
      });
  }

  const accounts = await ctx.db
    .query("salesDataAccounts")
    .withIndex("by_company_import_group_name", (q) =>
      q.eq("companyId", args.companyId).eq("importId", args.importId)
    )
    .take(NEXT_CUSTOMER_SCAN_LIMIT);

  // Every chain is looked through on every job, including ones that already have
  // prospects against them: a chain cut short by a budget records two sites out
  // of twenty and then looks exactly like a chain that was finished.
  const chains = new Map<string, string>();
  for (const account of accounts) {
    if (!chains.has(account.groupNameKey)) chains.set(account.groupNameKey, account.groupName);
  }

  return {
    customers: prioritizeSizeGaps(customers),
    chains: [...chains].map(([key, label]) => ({ key, label })),
    prospects: prioritizeSizeGaps(prospects),
  };
}

function prioritizeSizeGaps(
  items: Array<{ key: string; label: string; priority: boolean }>
): { key: string; label: string }[] {
  return items
    .map((item, index) => ({ ...item, index }))
    .sort((first, second) => {
      if (first.priority !== second.priority) return first.priority ? -1 : 1;
      return first.index - second.index;
    })
    .map(({ key, label }) => ({ key, label }));
}

/** The research agent this workspace's job will use. Exported for the job. */
export async function resolveResearchAgentForCompany(
  ctx: TenantMutationCtx,
  companyId: Id<"companies">
) {
  return await resolveResearchAgent(ctx, companyId);
}

/**
 * The prospect finder's own instruction sheet.
 *
 * Written to the same standard as the record filler's, for one skill only:
 * how a group hunt goes, where the truth about a group's sites lives, and the
 * honesty rules for filing one. A finder run never pays to carry the
 * detail-filling rules, and cannot be argued into detail work it has no tools
 * for.
 */
const FINDER_SYSTEM_PROMPT = `You find the sites in the groups Comax supplies — the ones their sales spreadsheet does not hold — and file each one as a prospect.

HOW A RUN GOES
1. Call "Comax — Read a group" to get a group. Call it with no group name to be given the next one nobody has looked through yet.
2. You will be told the group's name, its customer type, the sites already supplied, and the sites already found. Your job is the sites in neither list.
3. Find the group's own website and its list of its sites — usually a page called Our Homes, Our Hotels, Our Schools or similar. That list is the truth about what the group runs. Prefer it over any register or directory page.
4. FILE AS YOU GO. The moment you are sure a site belongs to the group, call "Comax — Record a site in a group" for it, before you read anything else. Do not read several pages first and file at the end — you will run out of budget before writing anything down, and the whole run is wasted.
5. Report every site you find, including ones you think are already supplied — you will be told which those are, and that is how the count stays honest. A site that is already a customer is refused and named back to you; stop offering it and move on.
6. A town and a postcode make a filed site worth far more — the postcode is the strongest signal for telling a new site from one already supplied. Take them from the group's own page for that site when they are shown.
7. When the group's list is exhausted, say what you did and stop.

WHERE TO LOOK
- The group's own website first, always. Its list of its sites is usually complete and current.
- For a care group, the Care Quality Commission register at cqc.org.uk lists every registered location under the provider. Use it to check you have not missed a site the group's own pages do not show.
- When you read a register or any listing page, ask Firecrawl for the whole page by setting mainContentOnly to false. Those lists sit outside the main article, and you will otherwise get the navigation and nothing else.

BEING HONEST
- Every site needs the address of the page that lists it. If you cannot name the page, you have not found the site.
- One line of reasoning per site: why you believe it belongs to this group.
- Never infer a site from a name pattern, and never file a site you have not seen listed on a page you read this run.
- A group whose list shows nothing new is a finished group, not a failure. Say so and ask for the next task.`;

/**
 * The record filler's instruction sheet, owned here since 2026-08-03.
 *
 * Originally tuned by hand on the agent's settings screen; brought into code
 * the day Anthony named the priority — *"the client is looking for number of
 * pupils for schools and number of bedrooms for care homes, this is the key
 * metric for the next phase"* — so the priority section below travels with
 * the template instead of living only in one deployment's database.
 */
const FILLER_SYSTEM_PROMPT = `You research Comax's customers on the open web and fill in the contact details their sales spreadsheet does not hold.

THE FIGURE THAT MATTERS MOST
Comax's next phase is sized on one number per business: pupils for a school, bedrooms for a care home or a hotel. Treat that figure as the most valuable single detail on the record.
- It is worth a page read of its own. For a school, the government's schools register carries the roll. For a care home or a hotel, the business's own site is the only source — an "about us", "our rooms" or "our home" page usually carries it.
- The honesty rules do not soften for it. A figure you did not read on a page about this exact business is not a finding: never estimate, never count photographs, never take the chain's total for one of its sites. Record it as not found rather than guessing — that is a useful answer.

HOW A RUN GOES
1. Call "Comax — Read a customer's record" to get a customer. Call it with no account name to be given the next one that still has gaps.
2. You will be told the business name, the chain it belongs to, its type, what is already known, and exactly which details are missing. Work only on the missing ones.
3. Find the business's own contact page. That one page usually carries the address, the postcode and the telephone number together.
4. RECORD AS YOU GO. The moment a page gives you a detail, call "Comax — Record a customer detail" for it, before you read anything else. Do not read several pages first and record at the end — you will run out of budget before writing anything down, and the whole run is wasted.
5. Two or three pages is normally enough for contact details. For bedrooms or pupils, do not stop until you have checked the strongest likely source and can cite the exact page you checked.
6. When there is nothing left you can find for that customer, say what you did and stop.

IDENTIFY THE INDIVIDUAL BUSINESS, NEVER THE CHAIN
Most of these customers belong to a group — nine are Daish's hotels, six are Colten Care homes. Head office's address and switchboard are not the customer's, and writing them onto nine records looks like success while being entirely wrong.
- Search the business name. Use the chain only as a tiebreaker, never on its own.
- If the business name and the chain name lead you to the same page, you have not found the individual site. Record nothing.
- A chain's own website usually has one page per site. That page is what you want, not the chain's contact page.
- Before you record anything, be able to say in one line why that page is about that one site.

WHERE TO LOOK
- The business's own website is best for address, phone, email and named contacts. Directory listings carry numbers that stopped working years ago.
- For a care home, the Care Quality Commission register at cqc.org.uk carries the individual home's address and telephone number. It does NOT publish bed counts — do not look for one there.
- For a school, the government's schools register carries the roll.
- A bed count for a care home or a hotel comes from the business's own site or it does not exist. Record it as not found rather than estimating.
- When you read a register or any listing page, ask Firecrawl for the whole page by setting mainContentOnly to false. Those lists sit outside the main article, and you will otherwise get the navigation and nothing else.
- Do not spend a call on country. It is almost never printed on a British business's contact page. Record it as not found straight away, or leave it.

BEING HONEST
- Report confidence honestly. HIGH means the page names this exact business and states this exact detail plainly. Anything less is routed to a person, which is a normal outcome and not a failure.
- Every detail needs the address of the page you took it from. If you cannot name the page, you have not found the detail.
- If a detail is not published anywhere you looked, record it with notFound set. For bedrooms or pupils, include the exact page you checked as the source. That is useful — it stops this customer being searched for the same thing every month.
- Never infer. Do not guess a postcode from a town, an email address from a domain, a phone number from a pattern, or a room count from photographs.
- Take only contact details a business publishes about itself. Never assemble them from social profiles or people-search sites.`;

/** Which of the connector's tools each worker holds. The boundary, as data. */
const FILLER_TOOL_MAPPINGS = [
  "salesCustomers.research.read",
  "salesCustomers.research.record",
  "salesCustomers.job.next",
] as const;
const FINDER_TOOL_MAPPINGS = [
  "salesCustomers.prospects.read",
  "salesCustomers.prospects.record",
  "salesCustomers.job.next",
] as const;
/** Both workers read the web the same way. */
const SHARED_TOOL_MAPPINGS = ["web.scrape"] as const;

/**
 * Set the two workers up: one skill each, tools to match.
 *
 * Idempotent on purpose — run it again after creating a fresh agent, or after
 * a binding has been fiddled with by hand, and it converges on the same
 * state. It moves the group tools off the filler and onto the finder, which
 * is the moment the two-agent shape becomes real for a workspace: worker
 * resolution goes by these bindings, not by agent names.
 *
 * Prompts: both workers' sheets are owned here and set on every run, so a
 * priority stated in one conversation becomes part of the product rather
 * than one deployment's database tuning.
 */
export const provisionResearchWorkers = internalMutation({
  args: {
    fillerAgentId: v.id("agents"),
    finderAgentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    const [filler, finder] = await Promise.all([
      ctx.db.get(args.fillerAgentId),
      ctx.db.get(args.finderAgentId),
    ]);
    if (!filler || !finder) throw appError("INVALID_INPUT", "Both agents must exist.");
    if (args.fillerAgentId === args.finderAgentId) {
      throw appError("INVALID_INPUT", "The two workers must be different agents.");
    }

    const tools = await ctx.db.query("aiTools").take(500);
    const byMapping = new Map(tools.map((tool) => [tool.handlerMapping, tool]));

    const ensureBinding = async (agentId: Id<"agents">, mapping: string) => {
      const tool = byMapping.get(mapping);
      if (!tool) throw appError("NOT_CONFIGURED", `No tool is installed for ${mapping}.`);
      const existing = await ctx.db
        .query("agentTools")
        .withIndex("by_tool", (q) => q.eq("toolId", tool._id))
        .take(200);
      if (existing.some((binding) => binding.agentId === agentId)) return;
      await ctx.db.insert("agentTools", { agentId, toolId: tool._id, assignedAt: Date.now() });
    };

    const removeBinding = async (agentId: Id<"agents">, mapping: string) => {
      const tool = byMapping.get(mapping);
      if (!tool) return;
      const existing = await ctx.db
        .query("agentTools")
        .withIndex("by_tool", (q) => q.eq("toolId", tool._id))
        .take(200);
      for (const binding of existing) {
        if (binding.agentId === agentId) await ctx.db.delete(binding._id);
      }
    };

    for (const mapping of [...FILLER_TOOL_MAPPINGS, ...SHARED_TOOL_MAPPINGS]) {
      await ensureBinding(args.fillerAgentId, mapping);
    }
    // Only the other skill's own tools are taken away — the queue tool and the
    // web reader are shared, and stripping them would leave a worker mute.
    for (const mapping of ["salesCustomers.prospects.read", "salesCustomers.prospects.record"]) {
      await removeBinding(args.fillerAgentId, mapping);
    }
    for (const mapping of [...FINDER_TOOL_MAPPINGS, ...SHARED_TOOL_MAPPINGS]) {
      await ensureBinding(args.finderAgentId, mapping);
    }
    for (const mapping of ["salesCustomers.research.read", "salesCustomers.research.record"]) {
      await removeBinding(args.finderAgentId, mapping);
    }

    await ctx.db.patch(args.fillerAgentId, {
      systemPrompt: FILLER_SYSTEM_PROMPT,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(args.finderAgentId, {
      systemPrompt: FINDER_SYSTEM_PROMPT,
      // A fresh agent carries the platform's cautious defaults, which are
      // sized for a question, not a queue. Only unset bounds are filled in —
      // bounds somebody has tuned on the settings screen are theirs.
      ...(finder.maxSteps === undefined ? { maxSteps: 500 } : {}),
      ...(finder.maxToolCalls === undefined ? { maxToolCalls: 500 } : {}),
      ...(finder.maxRuntimeMs === undefined ? { maxRuntimeMs: 3_600_000 } : {}),
      ...(finder.maxInputTokens === undefined ? { maxInputTokens: 5_000_000 } : {}),
      ...(finder.maxCostGBP === undefined ? { maxCostGBP: 25 } : {}),
      updatedAt: Date.now(),
    });

    return { configured: true };
  },
});

/**
 * Research every customer that still has gaps.
 *
 * One run per customer rather than one run for all of them: a run is bounded,
 * retryable and readable on its own, and one impossible customer does not take
 * the other thirty-eight down with it.
 *
 * Customers already filled in, and customers whose remaining gaps have all been
 * searched for and found unpublished, are skipped — which is what makes pressing
 * this a second time cheap rather than a repeat of the bill.
 *
 * Superseded by the research job, which does all three passes under one press
 * and knows when they are finished. Kept until that lands.
 */
export const startCustomerResearchSweep = tenantMutation({
  args: {},
  handler: async (ctx) => {
    const companyId = await requireSalesDataCompany(ctx);
    const currentImport = await getCurrentImport(ctx, companyId);
    if (!currentImport) throw appError("NOT_FOUND", "There is no imported data to research against.");

    const agent = await resolveResearchAgent(ctx, companyId);

    // Prospects are swept alongside customers, and interleaved with them.
    // Anthony, 2026-08-01: *"when we find a prospect we need to find all their
    // details too."* A site's name and postcode is enough to prioritise it; it
    // is not enough to ring it.
    const subjects = await collectResearchSubjects(ctx, {
      companyId,
      importId: currentImport._id,
    });

    const now = Date.now();
    let queued = 0;
    let skipped = 0;

    for (const subject of subjects) {
      // Gaps are worked out before the cap is consulted, so `skipped` counts
      // records that genuinely still need work. Counting every remaining record
      // made a sweep that had in fact finished report dozens left behind.
      const details = await loadDetailsRow(ctx, companyId, subject.key);
      const research = await loadResearchRows(ctx, companyId, subject.key);
      if (describeGaps(subject, details, research).missing.length === 0) continue;

      if (queued >= SWEEP_MAX_RUNS) {
        skipped += 1;
        continue;
      }

      await queueResearchRun(ctx, {
        agent,
        companyId,
        accountNameKey: subject.key,
        delayMs: queued * SWEEP_STAGGER_MS,
        now,
      });
      queued += 1;
    }

    // Said rather than silently truncated: a capped sweep that reports only its
    // own count reads as "everything is covered" when it is not.
    return { queued, skipped };
  },
});

/**
 * Look through every group for sites the workspace does not supply.
 *
 * One run per group, staggered, exactly as the customer sweep works. Doing it
 * by hand meant pressing Run once per group and waiting between each, which is
 * why only one of the ten had been looked through — and a list that has only
 * been half searched reads as a list with nothing more to find.
 *
 * Every group is looked through on every press, including ones that already
 * have prospects against them. The first version skipped those to save money,
 * and that was wrong: a run cut short by the budget records two sites out of
 * twenty and then looks, to the next press, exactly like a group that was
 * finished. A half-searched estate reporting itself as done is the same failure
 * this whole feature exists to avoid.
 *
 * Re-running is safe rather than merely tolerable — the matching rules refuse a
 * site already on file, so a second pass adds only what the first one missed.
 * What it costs is a few pence per group, which is the cheaper mistake.
 */
export const startProspectingSweep = tenantMutation({
  args: {
    /** Only the groups nobody has looked at yet. Off by default; see above. */
    unsearchedOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const companyId = await requireSalesDataCompany(ctx);
    const currentImport = await getCurrentImport(ctx, companyId);
    if (!currentImport) throw appError("NOT_FOUND", "There is no imported data to research against.");

    const agent = await resolveResearchAgent(ctx, companyId);

    const accounts = await ctx.db
      .query("salesDataAccounts")
      .withIndex("by_company_import_group_name", (q) =>
        q.eq("companyId", companyId).eq("importId", currentImport._id)
      )
      .take(NEXT_CUSTOMER_SCAN_LIMIT);

    const groups = new Map<string, string>();
    for (const account of accounts) {
      if (!groups.has(account.groupNameKey)) groups.set(account.groupNameKey, account.groupName);
    }

    const now = Date.now();
    let queued = 0;
    let skipped = 0;

    for (const [groupNameKey, groupName] of groups) {
      if (queued >= SWEEP_MAX_RUNS) {
        skipped += 1;
        continue;
      }

      if (args.unsearchedOnly) {
        const alreadyFound = await ctx.db
          .query("salesDataProspects")
          .withIndex("by_company_group", (q) =>
            q.eq("companyId", companyId).eq("groupNameKey", groupNameKey)
          )
          .first();
        if (alreadyFound) continue;
      }

      const objective = [
        `Find every site in the ${groupName} group.`,
        "Read the group first so you know which sites are already supplied,",
        "then record each site you find. Prefer the group's own list of its sites",
        "over any single register page.",
      ].join(" ");

      const agentVersionId = await ensureAgentVersionSnapshot(ctx, {
        agentId: agent._id,
        companyId,
      });

      const agentRunId = await ctx.db.insert("agentRuns", {
        agentId: agent._id,
        agentVersionId,
        triggerType: "MANUAL",
        objective,
        title: `${groupName} · find sites`,
        status: "QUEUED",
        companyId,
        userId: ctx.userId,
        startedAt: now,
        updatedAt: now,
      });

      await ctx.scheduler.runAfter(
        queued * SWEEP_STAGGER_MS,
        internal.agentRuntime.runTriggeredAgentObjective,
        {
          agentId: agent._id,
          objective,
          triggerType: "MANUAL",
          runId: agentRunId,
          companyId,
          userId: ctx.userId,
        }
      );
      queued += 1;
    }

    return { queued, skipped };
  },
});

/**
 * Accept or discard something the agent parked, or reject a value it applied.
 *
 * One mutation for all three because they are the same decision at different
 * stages, and splitting them would mean three ways to get the supersede rule
 * wrong instead of one.
 *
 * - `accept` on a parked finding writes it to the record and marks it applied.
 * - `discard` on a parked finding drops it, and it stops being offered.
 * - `discard` on an applied value clears the field as well — the "not right"
 *   action beneath a researched detail.
 *
 * A rejected finding is kept rather than deleted, so the same value from the
 * same page is not offered again next month.
 */
export const decideResearchFinding = tenantMutation({
  args: {
    researchId: v.id("salesDataCustomerResearch"),
    decision: v.union(v.literal("accept"), v.literal("discard")),
  },
  handler: async (ctx, args) => {
    const companyId = await requireSalesDataCompany(ctx);
    const row = await ctx.db.get(args.researchId);

    // Checked against the caller's own workspace rather than trusted from the
    // id, as everywhere else in this vertical.
    if (!row || row.companyId !== companyId) {
      throw appError("UNAUTHORIZED", "That finding is not in this workspace.");
    }
    if (row.status !== "NEEDS_CHECK" && row.status !== "APPLIED") {
      throw appError("CONFLICT", "That finding has already been decided.");
    }

    const now = Date.now();
    const decided = { decidedBy: ctx.userId, decidedAt: now };

    if (args.decision === "discard") {
      // Clearing the field only matters when the value on the record is the
      // agent's. A parked finding never reached it.
      if (row.status === "APPLIED" && isResearchField(row.field)) {
        await writeCustomerField(ctx, {
          companyId,
          accountNameKey: row.subjectKey,
          field: row.field,
          value: undefined,
          actorId: ctx.userId,
          now,
        });
      }
      await ctx.db.patch(row._id, { status: "REJECTED", ...decided });
      return { status: "REJECTED" as const };
    }

    if (row.status === "APPLIED") return { status: "APPLIED" as const };
    if (!isResearchField(row.field)) throw appError("CONFLICT", "That finding is for a detail we no longer hold.");

    const parsed = parseResearchValue(row.field, row.value);
    if (parsed === null) throw appError("INVALID_INPUT", "That finding is not a value this detail can hold.");

    await writeCustomerField(ctx, {
      companyId,
      accountNameKey: row.subjectKey,
      field: row.field,
      value: parsed,
      actorId: ctx.userId,
      now,
    });

    // Anything else still parked for this field is now stale: accepting one
    // answer is a decision about the others.
    await supersedeOtherPendingFindings(ctx, {
      companyId,
      subjectKey: row.subjectKey,
      field: row.field,
      keep: row._id,
      actorId: ctx.userId,
      now,
    });

    await ctx.db.patch(row._id, { status: "APPLIED", ...decided });
    return { status: "APPLIED" as const };
  },
});

function parseResearchValue(field: ResearchField, value: string): string | number | null {
  if (RESEARCHABLE_FIELDS[field] !== "number") return value.trim() || null;
  return parseCount(value);
}

async function supersedeOtherPendingFindings(
  ctx: Pick<MutationCtx, "db">,
  args: {
    companyId: Id<"companies">;
    subjectKey: string;
    field: ResearchField;
    keep: Id<"salesDataCustomerResearch">;
    actorId: Id<"users">;
    now: number;
  }
) {
  const rows = await ctx.db
    .query("salesDataCustomerResearch")
    .withIndex("by_company_subject_field", (q) =>
      q.eq("companyId", args.companyId).eq("subjectKey", args.subjectKey).eq("field", args.field)
    )
    .take(RESEARCH_ROWS_PER_SUBJECT_LIMIT);

  for (const row of rows) {
    if (row._id === args.keep) continue;
    if (row.status !== "NEEDS_CHECK") continue;
    await ctx.db.patch(row._id, {
      status: "SUPERSEDED",
      decidedBy: args.actorId,
      decidedAt: args.now,
    });
  }
}

/**
 * A person's edit outranks the agent's.
 *
 * Called from the typed-in save. Any `APPLIED` finding for a field somebody has
 * just edited becomes `SUPERSEDED`, so the source marker disappears from the
 * screen at the moment the value stops being the agent's — rather than sitting
 * under a hand-typed number claiming it came from a website.
 *
 * Only the fields actually edited are touched. Saving the form re-submits every
 * box, so superseding all of them would wipe the provenance off eleven fields
 * because somebody corrected one.
 */
export async function supersedeResearchForFields(
  ctx: Pick<MutationCtx, "db">,
  args: {
    companyId: Id<"companies">;
    subjectKey: string;
    fields: ResearchField[];
    actorId: Id<"users">;
    now: number;
  }
) {
  for (const field of args.fields) {
    const rows = await ctx.db
      .query("salesDataCustomerResearch")
      .withIndex("by_company_subject_field", (q) =>
        q.eq("companyId", args.companyId).eq("subjectKey", args.subjectKey).eq("field", field)
      )
      .take(RESEARCH_ROWS_PER_SUBJECT_LIMIT);

    for (const row of rows) {
      if (row.status !== "APPLIED") continue;
      await ctx.db.patch(row._id, {
        status: "SUPERSEDED",
        decidedBy: args.actorId,
        decidedAt: args.now,
      });
    }
  }
}
