import { v } from "convex/values";
import { normalizeToolFunctionName } from "./aiToolExecutionService";
import { BUILT_IN_TOOL_CONNECTORS } from "./toolConnectorDefinitions";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { superAdminQuery } from "./tenantFunctions";
import { calculateModelCostGBP } from "./aiCostService";
// template:remove:start salesData
import { recordAccounts } from "./salesData";
import { normalizeKey } from "./salesDataImportService";
import { buildGapProducts } from "./salesOpportunityService";
// template:remove:end
import { agentKindToApplyMode, companyCategoryToApplyMode } from "./utils/memoryApplication";
import { DEFAULT_COMPANY_MODULE_KEYS } from "./utils/coreModules";
import { dayKey as governanceDayKey } from "./governanceActivityService";
import { foldWindowIntoBuckets } from "./governanceRollupService";
import {
  EMBEDDING_MODEL_USE_CASE,
  GOOGLE_VERTEX_EMBEDDING_MODEL_ID,
  GOOGLE_VERTEX_PROVIDER_KEY,
  buildModelSearchText,
} from "./aiModelService";

/** The model Google retired, kept here only so the migration can retire the row. */
const RETIRED_EMBEDDING_MODEL_ID = "text-embedding-004";

/**
 * Below this, a difference between a stored and a recomputed cost is floating
 * point noise rather than a mispriced row. Costs run to six decimal places on
 * screen, so the tolerance sits an order of magnitude below what anyone reads.
 */
const REPRICE_TOLERANCE = 1e-9;

/**
 * Data migrations and backfills.
 *
 * `npx convex deploy` applies schema changes but never touches existing rows,
 * so adding a field to 77 tables' worth of live data previously had no
 * supported path. This gives one:
 *
 * - Each migration is a named function that processes a single page and
 *   returns the next cursor. Convex mutations are transactional per batch, so a
 *   crash mid-run loses at most one batch.
 * - Progress is recorded in the `migrations` table, so a run resumes from its
 *   cursor rather than starting over, and a completed migration will not re-run.
 * - Migrations must be idempotent: they should skip rows already in the target
 *   state. That makes a resumed or re-triggered run safe.
 *
 * Built on the same scheduler-driven batching the purge pipeline already uses
 * (`convex/purges.ts`) rather than adding a component dependency.
 *
 * Run one with:
 *   npx convex run migrations:run '{"name":"2026-07-25-swarm-logs-company-id"}'
 *
 * Check progress with the `migrations:getStatus` query, or:
 *   npx convex run migrations:listStatus '{}'
 */

const DEFAULT_BATCH_SIZE = 200;
/** Safety stop: a migration that never finishes should surface, not loop forever. */
const MAX_BATCHES = 10000;

type MigrationBatchResult = {
  cursor: string | null;
  isDone: boolean;
  /** Documents examined in this batch. */
  processed: number;
  /** Documents actually changed in this batch. */
  updated: number;
};

type MigrationRunner = (
  ctx: MutationCtx,
  cursor: string | null,
  batchSize: number,
) => Promise<MigrationBatchResult>;

/**
 * Registered migrations, keyed by a stable name that also records when it was
 * introduced. Never rename or reuse a key: the name is the ledger's identity.
 */
/*
 * Two retirement migrations lived here and have been removed:
 * `2026-07-26-retire-unread-company-check-fields` and
 * `2026-07-26-retire-company-check-category`. They cleared six fields off
 * `companyEvalCases`, and once the fields left `schema.ts` the migrations could no
 * longer compile against the very schema they existed to enable.
 *
 * They ran on dev, and this is a one-way door: a deployment whose rows still carry
 * those fields will have its schema push refused, with no migration left to clear
 * them. Recovering means checking out the commit before the removal, deploying that,
 * running both migrations, then deploying forward. Anthony confirmed on 2026-07-26
 * that nothing real was live, which is why that trade was taken rather than carrying
 * dead code indefinitely.
 */
const MIGRATIONS: Record<string, MigrationRunner> = {
  /**
   * Seeds every company with the platform's own capabilities (shared-screen-kit
   * plan, Phase 6).
   *
   * `enabledModules` used to name only bespoke extras, so absence meant "never
   * bought one". Phase 6 makes the same list carry the platform's core
   * capabilities, where absence means "withheld" — and that reading, applied to
   * rows written before the switch existed, would turn the whole platform off
   * for every existing company in one deploy. This runs in that deploy and
   * writes down what was already true: every company had every capability.
   *
   * Idempotent: a company that has the full set is left alone. It adds and
   * never removes, so a bespoke module like Sales Data survives untouched.
   * One-shot by the framework — a completed run does not repeat, which is
   * what keeps a later, deliberate withholding from being quietly undone.
   */
  /**
   * Builds every historical governance day bucket, so the charts are full on
   * the day the rollup lands rather than starting empty
   * (governance-screens-read-a-summary plan, Phase 3).
   *
   * The cursor is a date, not a row: each batch recomputes one UTC day from
   * the raw tables and SETS its buckets — delete the day's rows, insert the
   * recomputed ones — so a resumed or re-triggered run converges on the same
   * answer instead of double-counting. Days after the cursor date are the
   * cron's to keep fresh; days it has already written are simply rewritten
   * with the same figures.
   */
  "2026-08-18-governance-day-rollups-backfill": async (ctx, cursor, _batchSize) => {
    const today = governanceDayKey(Date.now());

    let date = cursor;
    if (!date) {
      const earliest = await ctx.db.query("agentRuns").withIndex("by_started").order("asc").first();
      const earliestCall = await ctx.db.query("agentToolCalls").withIndex("by_started").order("asc").first();
      const starts = [earliest?.startedAt, earliestCall?.startedAt].filter(
        (at): at is number => at !== undefined,
      );
      if (starts.length === 0) {
        return { cursor: null, isDone: true, processed: 0, updated: 0 };
      }
      date = governanceDayKey(Math.min(...starts));
    }

    const dayStart = Date.parse(`${date}T00:00:00.000Z`);
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const DAY_ROW_LIMIT = 10000;

    const [runs, calls, approvalsByStatus, agents] = await Promise.all([
      ctx.db
        .query("agentRuns")
        .withIndex("by_started", (q) => q.gte("startedAt", dayStart).lt("startedAt", dayEnd))
        .take(DAY_ROW_LIMIT),
      ctx.db
        .query("agentToolCalls")
        .withIndex("by_started", (q) => q.gte("startedAt", dayStart).lt("startedAt", dayEnd))
        .take(DAY_ROW_LIMIT),
      Promise.all(
        (["PENDING", "APPROVED", "REJECTED", "EXPIRED", "CANCELLED"] as const).map((status) =>
          ctx.db
            .query("agentRunApprovals")
            .withIndex("by_status_requested", (q) =>
              q.eq("status", status).gte("requestedAt", dayStart).lt("requestedAt", dayEnd))
            .take(DAY_ROW_LIMIT),
        ),
      ),
      ctx.db.query("agents").take(500),
    ]);

    const agentsById = new Map(
      agents.map((agent) => [
        agent._id as string,
        { id: agent._id as string, name: agent.name, risk: agent.riskLevel ?? "UNRATED" },
      ]),
    );

    const buckets = foldWindowIntoBuckets({
      runs: runs.map((run) => ({
        id: run._id as string,
        companyId: run.companyId as string | undefined,
        agentId: run.agentId as string,
        startedAt: run.startedAt,
        status: run.status,
      })),
      calls: calls.map((call) => ({
        companyId: call.companyId as string | undefined,
        agentId: call.agentId as string,
        startedAt: call.startedAt,
        sideEffectLevel: call.sideEffectLevel,
      })),
      neededAPerson: new Set(approvalsByStatus.flat().map((approval) => approval.runId as string)),
      agentsById,
      truncated: runs.length >= DAY_ROW_LIMIT || calls.length >= DAY_ROW_LIMIT,
    });

    const now = Date.now();
    const existing = await ctx.db
      .query("governanceDayRollups")
      .withIndex("by_date", (q) => q.eq("date", date))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);
    for (const bucket of buckets) {
      await ctx.db.insert("governanceDayRollups", { ...bucket, computedAt: now });
    }

    const nextDate = governanceDayKey(dayEnd);
    return {
      cursor: nextDate,
      isDone: date >= today,
      processed: runs.length + calls.length,
      updated: buckets.length,
    };
  },

  /**
   * Gives every existing tool the name a model should know it by.
   *
   * Until this landed there was no such field: a tool reached the model as its
   * *routing key* with the punctuation swapped for underscores. That was an
   * accident which read well for some (`knowledge_search`) and badly for others
   * (`salesCustomers_research_read`), and it meant a tool could not be renamed
   * without being rerouted.
   *
   * Where the tool came from a built-in connector, the chosen name comes from
   * that connector's definition — a real name, picked by a person. Where it did
   * not, the tool was hand-made by a super-admin and nobody has expressed an
   * intent beyond what it already presents as, so the old derived name is
   * carried across rather than invented. Those are the only two sources, and
   * neither guesses.
   *
   * Idempotent: a tool that already has one is skipped, so a resumed or
   * re-triggered run is safe.
   */
  "2026-08-24-tool-model-names": async (ctx, cursor, batchSize) => {
    const page = await ctx.db.query("aiTools").paginate({ cursor, numItems: batchSize });
    const chosenByMapping = new Map(
      BUILT_IN_TOOL_CONNECTORS.flatMap((connector) =>
        connector.toolDefinitions.map((definition) =>
          [definition.handlerMapping, definition.modelName] as const)),
    );
    let updated = 0;

    for (const tool of page.page) {
      if (tool.modelName) continue;

      const modelName = chosenByMapping.get(tool.handlerMapping)
        ?? normalizeToolFunctionName(tool.handlerMapping);

      await ctx.db.patch(tool._id, { modelName });
      updated += 1;
    }

    return {
      cursor: page.continueCursor,
      isDone: page.isDone,
      processed: page.page.length,
      updated,
    };
  },

  "2026-08-18-core-company-modules-backfill": async (ctx, cursor, batchSize) => {
    const page = await ctx.db.query("companies").paginate({ cursor, numItems: batchSize });
    let updated = 0;

    for (const company of page.page) {
      const current = company.enabledModules ?? [];
      const missing = DEFAULT_COMPANY_MODULE_KEYS.filter((key) => !current.includes(key));
      if (missing.length === 0) continue;

      await ctx.db.patch(company._id, { enabledModules: [...current, ...missing] });
      updated += 1;
    }

    return {
      cursor: page.continueCursor,
      isDone: page.isDone,
      processed: page.page.length,
      updated,
    };
  },

  /**
   * Backfills enabled COMPANY_CHAT and WIDGET bindings for every ACTIVE
   * company skill that lacks them (company-skills-surfaces plan, step 2).
   *
   * The runtime now reads bindings as the switch, and absence means off —
   * so this must land in the same deploy, or every existing company's
   * skills silently stop applying. Behaviour on deploy day is identical to
   * the day before: skills that served every message keep serving both
   * surfaces until somebody turns one off.
   *
   * Idempotent, and it never overrules a decision: a binding row that
   * already exists — enabled or deliberately disabled — is left alone.
   */
  "2026-08-13-company-skill-bindings-backfill": async (ctx, cursor, batchSize) => {
    const page = await ctx.db.query("companySkills").paginate({ cursor, numItems: batchSize });
    let updated = 0;

    for (const skill of page.page) {
      if (skill.status !== "ACTIVE") continue;

      for (const surfaceType of ["COMPANY_CHAT", "WIDGET"] as const) {
        const existing = await ctx.db
          .query("companySkillBindings")
          .withIndex("by_company_skill_surface", (q) =>
            q.eq("companyId", skill.companyId).eq("skillId", skill._id).eq("surfaceType", surfaceType))
          .filter((q) => q.eq(q.field("surfaceId"), undefined))
          .first();
        if (existing) continue;

        const now = Date.now();
        await ctx.db.insert("companySkillBindings", {
          companyId: skill.companyId,
          skillId: skill._id,
          surfaceType,
          isEnabled: true,
          // No assignedBy: nobody flipped this switch, the deploy did.
          assignedAt: now,
          updatedAt: now,
        });
        updated += 1;
      }
    }

    return {
      cursor: page.continueCursor,
      isDone: page.isDone,
      processed: page.page.length,
      updated,
    };
  },

  /**
   * Rebuilds the outcome counters on `agentMemories` from `agentMemoryUsage`
   * (self-improvement plan, Phase 2). Memories written before the counters
   * existed would otherwise rank as if they had no history, when the history
   * has been in the usage table all along. One count per run, matching the
   * live stamping in `agentRunStateService`.
   *
   * DO NOT RE-RUN once the agentRunHistory retention pipeline has fired on
   * a deployment: that pipeline deletes old `agentMemoryUsage` rows, so a
   * rebuild from what remains would silently shrink every memory's counters
   * (retention-and-purge-plan, Phase 2.3). The cached counters are the
   * authoritative record from then on.
   */
  "2026-08-09-agent-memory-outcome-counters": async (ctx, cursor, batchSize) => {
    const page = await ctx.db.query("agentMemories").paginate({ cursor, numItems: batchSize });
    let updated = 0;

    for (const memory of page.page) {
      const usages = await ctx.db
        .query("agentMemoryUsage")
        .withIndex("by_memory_used", (q) => q.eq("memoryId", memory._id))
        .order("desc")
        .take(1000);

      const outcomeByRun = new Map<string, "SUCCESS" | "FAILED" | "CANCELLED">();
      let lastOutcomeAt: number | undefined;
      for (const usage of usages) {
        if (usage.outcome === "OBSERVED") continue;
        outcomeByRun.set(usage.runId, usage.outcome);
        if (lastOutcomeAt === undefined || usage.updatedAt > lastOutcomeAt) {
          lastOutcomeAt = usage.updatedAt;
        }
      }

      const counts = { successCount: 0, failureCount: 0, cancelledCount: 0 };
      for (const outcome of outcomeByRun.values()) {
        if (outcome === "SUCCESS") counts.successCount += 1;
        else if (outcome === "FAILED") counts.failureCount += 1;
        else counts.cancelledCount += 1;
      }

      // Idempotent: skip rows already carrying the rebuilt truth.
      if (
        (memory.successCount ?? 0) === counts.successCount &&
        (memory.failureCount ?? 0) === counts.failureCount &&
        (memory.cancelledCount ?? 0) === counts.cancelledCount
      ) continue;

      await ctx.db.patch(memory._id, {
        ...counts,
        ...(lastOutcomeAt !== undefined ? { lastOutcomeAt } : {}),
      });
      updated += 1;
    }

    return {
      cursor: page.continueCursor,
      isDone: page.isDone,
      processed: page.page.length,
      updated,
    };
  },


  // template:remove:start salesData
  /**
   * Builds `salesDataAccounts` from sales rows imported before it existed.
   *
   * The customer directory is written as rows are inserted, so any workbook
   * uploaded from now on populates it. Workspaces that imported earlier have
   * the rows and no directory, which reads as a workspace with no customers —
   * so this walks the rows and folds them down the same way the importer does.
   *
   * The totals accumulate page by page, so the skip test cannot be "does a
   * directory exist" — that would stop after the first page and leave every
   * later row uncounted. It is instead "is the directory already complete":
   * the product rows it accounts for match what the import recorded. That is
   * true of any import the importer built a directory for, and of a backfill
   * that has already finished, so re-running is a no-op either way.
   */
  /**
   * Stamps `salesDataRows.accountNameKey` on rows imported before it existed.
   *
   * The customer profile reads one account's rows by index. Rows without the
   * key are invisible to that index, so a customer imported earlier would show
   * an empty sales history rather than an error — the worst kind of wrong.
   */
  "2026-08-01-sales-data-row-account-key": async (ctx, cursor, batchSize) => {
    const page = await ctx.db.query("salesDataRows").paginate({ cursor, numItems: batchSize });
    let updated = 0;

    for (const row of page.page) {
      const key = normalizeKey(row.accountName);
      // Idempotent: skip anything already stamped with the same key.
      if (row.accountNameKey === key) continue;
      await ctx.db.patch(row._id, { accountNameKey: key });
      updated += 1;
    }

    return {
      cursor: page.continueCursor,
      isDone: page.isDone,
      processed: page.page.length,
      updated,
    };
  },

  "2026-08-01-sales-data-account-directory": async (ctx, cursor, batchSize) => {
    const page = await ctx.db.query("salesDataRows").paginate({ cursor, numItems: batchSize });
    let updated = 0;

    const byImport = new Map<string, typeof page.page>();
    for (const row of page.page) {
      const key = `${row.companyId}:${row.importId}`;
      byImport.set(key, [...(byImport.get(key) ?? []), row]);
    }

    for (const rows of byImport.values()) {
      const [first] = rows;
      if (!first) continue;

      const existing = await ctx.db
        .query("salesDataAccounts")
        .withIndex("by_company_import", (q) =>
          q.eq("companyId", first.companyId).eq("importId", first.importId)
        )
        .collect();

      const counted = existing.reduce((sum, account) => sum + account.productCount, 0);
      // No recorded row count means an import that never completed, so there is
      // no total to compare against and the directory is built unconditionally.
      const record = await ctx.db.get(first.importId);
      const expected = record?.salesRowCount ?? 0;
      if (expected > 0 && counted >= expected) continue;

      await recordAccounts(ctx, first.companyId, first.importId, rows);
      updated += rows.length;
    }

    return {
      cursor: page.continueCursor,
      isDone: page.isDone,
      processed: page.page.length,
      updated,
    };
  },

  /*
   * A migration lived here for an hour and was superseded before it shipped:
   * `2026-08-03-opportunity-report-category-examples` stamped three example
   * products per category onto finished reports. Anthony read the result and
   * called it — the report educates per gap, so per-gap product lists in
   * their own table replaced it (the backfill below). It ran on dev only;
   * the ledger row stays, the field it stamped stays validatable in the
   * schema, and the name must not be reused.
   */
  /**
   * Builds each finished report's gap order sheets — the products the sister
   * accounts buy in every gapped category — for reports written before the
   * `salesOpportunityReportGapProducts` table existed.
   *
   * A finished report is a paid run's output; asking Anthony to pay for
   * another one just so the gaps can name their products would be the wrong
   * kind of thrift. The sweep mirrors the gaps pass: accounts by index, each
   * account's rows by index, bounded the same way. Idempotent: a report
   * whose order sheets exist — every report from now on — is skipped.
   */
  "2026-08-03-opportunity-report-gap-products": async (ctx, cursor, batchSize) => {
    const page = await ctx.db
      .query("salesOpportunityReports")
      .paginate({ cursor, numItems: batchSize });
    let updated = 0;

    for (const report of page.page) {
      if (!report.gaps || report.gaps.length === 0) continue;

      const existing = await ctx.db
        .query("salesOpportunityReportGapProducts")
        .withIndex("by_company_report", (q) =>
          q.eq("companyId", report.companyId).eq("reportId", report._id)
        )
        .take(1);
      if (existing.length > 0) continue;

      const accounts = await ctx.db
        .query("salesDataAccounts")
        .withIndex("by_company_import", (q) =>
          q.eq("companyId", report.companyId).eq("importId", report.importId)
        )
        .take(500);

      const productRows: Array<{
        groupNameKey: string;
        categoryKey: string;
        productDescription: string;
        spendGBP: number;
      }> = [];
      const groupKeyOf = new Map<string, string>();
      for (const account of accounts) {
        groupKeyOf.set(account.accountNameKey, account.groupNameKey);
        const rows = await ctx.db
          .query("salesDataRows")
          .withIndex("by_company_import_account_name", (q) =>
            q
              .eq("companyId", report.companyId)
              .eq("importId", report.importId)
              .eq("accountNameKey", account.accountNameKey)
          )
          .take(1000);
        for (const row of rows) {
          productRows.push({
            groupNameKey: account.groupNameKey,
            categoryKey: row.productCategoryKey,
            productDescription: row.productDescription,
            spendGBP: row.totalRevenue,
          });
        }
      }

      const gapProducts = buildGapProducts(
        productRows,
        report.gaps.map((gap) => ({
          accountNameKey: gap.accountNameKey,
          categoryKey: gap.categoryKey,
          groupNameKey: groupKeyOf.get(gap.accountNameKey) ?? "",
        }))
      );
      for (const entry of gapProducts) {
        await ctx.db.insert("salesOpportunityReportGapProducts", {
          companyId: report.companyId,
          reportId: report._id,
          accountNameKey: entry.accountNameKey,
          categoryKey: entry.categoryKey,
          products: entry.products,
        });
      }
      updated += 1;
    }

    return {
      cursor: page.continueCursor,
      isDone: page.isDone,
      processed: page.page.length,
      updated,
    };
  },

  // template:remove:end
  /**
   * Backfills `users.lastLoginAt` from existing `logins` rows.
   *
   * The field is denormalised onto the user because Convex can only index
   * fields on the table being paginated, so the admin user directory cannot
   * sort by a join. Users who signed in before the field existed carry nothing,
   * and would read as "Never" on a screen whose whole job is spotting dormancy.
   *
   * Only a SUCCESS row counts. A user whose only attempts failed has genuinely
   * never signed in and must keep reading as "Never".
   */
  "2026-07-31-user-last-login-at": async (ctx, cursor, batchSize) => {
    const page = await ctx.db.query("users").paginate({ cursor, numItems: batchSize });
    let updated = 0;

    for (const user of page.page) {
      const newest = await ctx.db
        .query("logins")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .order("desc")
        .first();

      if (!newest || newest.status !== "SUCCESS") continue;
      // Idempotent: the invariant `recordLogin` also maintains.
      if (user.lastLoginAt === newest.timestamp) continue;

      await ctx.db.patch(user._id, { lastLoginAt: newest.timestamp });
      updated += 1;
    }

    return {
      cursor: page.continueCursor,
      isDone: page.isDone,
      processed: page.page.length,
      updated,
    };
  },

  /**
   * Backfills `swarmLogs.companyId`, added alongside the swarm-log access fix
   * so the rows carry tenant provenance without a join back through threads.
   * Rows written before that change have no tenant stamped.
   */
  "2026-07-25-swarm-logs-company-id": async (ctx, cursor, batchSize) => {
    const page = await ctx.db.query("swarmLogs").paginate({ cursor, numItems: batchSize });
    let updated = 0;

    for (const log of page.page) {
      // Idempotent: skip anything already stamped.
      if (log.companyId !== undefined) continue;

      const thread = await ctx.db.get(log.threadId);
      // A thread may legitimately have no company (unassigned or deleted);
      // leaving those unset is correct rather than inventing a tenant.
      if (!thread?.companyId) continue;

      await ctx.db.patch(log._id, { companyId: thread.companyId });
      updated += 1;
    }

    return {
      cursor: page.continueCursor,
      isDone: page.isDone,
      processed: page.page.length,
      updated,
    };
  },

  /**
   * Stamps `applyMode` onto every company memory.
   *
   * Company memory had eight categories and none of them changed what the model
   * saw. Two of them were really saying "this should apply to every answer" —
   * tone and boundary — and those were the ones the old keyword lookup was
   * least likely to surface. This records that distinction as the field the
   * runtime now reads.
   */
  "2026-07-26-company-memory-apply-mode": async (ctx, cursor, batchSize) => {
    const page = await ctx.db.query("companyMemories").paginate({ cursor, numItems: batchSize });
    let updated = 0;

    for (const memory of page.page) {
      if (memory.applyMode !== undefined) continue;
      await ctx.db.patch(memory._id, { applyMode: companyCategoryToApplyMode(memory.category) });
      updated += 1;
    }

    return {
      cursor: page.continueCursor,
      isDone: page.isDone,
      processed: page.page.length,
      updated,
    };
  },

  /**
   * Moves the catalogue off the retired embedding model.
   *
   * Google retired `text-embedding-004`. The catalogue still had it enabled and
   * serving the embedding use case, so every retrieval call asked for a model that
   * no longer exists and got a provider NOT_FOUND — swallowed by the catch each
   * caller wraps retrieval in, so the assistant simply answered with no knowledge
   * attached and nothing said so.
   *
   * `text-embedding-005` is the successor at the same 768 dimensions, so the vector
   * index is unchanged. It is regional rather than global, which the embedding
   * client handles.
   *
   * Single-batch: the catalogue holds a handful of embedding rows, not a table
   * worth of them. It reports `isDone` on the first pass and is idempotent, so a
   * re-run changes nothing.
   */
  "2026-07-26-embedding-model-005": async (ctx) => {
    const rows = await ctx.db
      .query("aiModels")
      .withIndex("by_provider", (q) => q.eq("providerKey", GOOGLE_VERTEX_PROVIDER_KEY))
      .take(2000);
    let updated = 0;

    for (const row of rows) {
      // Retire the dead model wherever it is still enabled or still flagged
      // default, so nothing resolves to it again.
      if (row.modelId === RETIRED_EMBEDDING_MODEL_ID && (row.isEnabled || row.isDefault)) {
        await ctx.db.patch(row._id, { isEnabled: false, isDefault: false, status: "RETIRED" });
        updated += 1;
      }
    }

    const successor = rows.find((row) => row.modelId === GOOGLE_VERTEX_EMBEDDING_MODEL_ID);
    if (!successor) {
      await ctx.db.insert("aiModels", {
        modelId: GOOGLE_VERTEX_EMBEDDING_MODEL_ID,
        providerKey: GOOGLE_VERTEX_PROVIDER_KEY,
        providerModelId: GOOGLE_VERTEX_EMBEDDING_MODEL_ID,
        displayName: "Text Embedding 005",
        friendlyName: "Text Embedding 005",
        description: "Google Vertex text embedding model, 768 dimensions. Serves knowledge retrieval.",
        isEnabled: true,
        isDefault: false,
        capabilities: ["embeddings"],
        supportedUseCases: [EMBEDDING_MODEL_USE_CASE],
        lastSyncedAt: Date.now(),
        searchText: buildModelSearchText({
          modelId: GOOGLE_VERTEX_EMBEDDING_MODEL_ID,
          providerModelId: GOOGLE_VERTEX_EMBEDDING_MODEL_ID,
          displayName: "Text Embedding 005",
          friendlyName: "Text Embedding 005",
        }),
      });
      updated += 1;
    } else if (!successor.isEnabled || !successor.supportedUseCases?.includes(EMBEDDING_MODEL_USE_CASE)) {
      await ctx.db.patch(successor._id, {
        isEnabled: true,
        capabilities: ["embeddings"],
        supportedUseCases: [EMBEDDING_MODEL_USE_CASE],
      });
      updated += 1;
    }

    return { cursor: null, isDone: true, processed: rows.length, updated };
  },


  /**
   * Backfills `lastRunStatus` and `lastRunAt` onto company checks.
   *
   * Three separate places used to work out "the latest run per check" by taking a
   * thousand runs and reducing them in the query, and one page load did it twice.
   * They now read the rollup on the case — but a check whose last run predates the
   * rollup has neither field, so it would read "Not run" despite having results, and
   * the gates would treat it as unproven.
   *
   * Reads the newest run per case through `by_case_completed`, which is one indexed
   * read per case rather than a scan of the run table.
   */
  "2026-07-26-company-check-last-run-rollup-fields": async (ctx, cursor, batchSize) => {
    const page = await ctx.db.query("companyEvalCases").paginate({ cursor, numItems: batchSize });
    let updated = 0;

    for (const evalCase of page.page) {
      // Both fields, not just one. Guarding on the status alone skipped exactly the
      // rows this exists to fix: a check run before `lastRunAt` was added carries a
      // status and no date, so the list showed "Passing" beside "—". Found by
      // looking at the screen after the first version of this had "completed".
      if (evalCase.lastRunStatus !== undefined && evalCase.lastRunAt !== undefined) continue;

      const latestRun = await ctx.db
        .query("companyEvalRuns")
        .withIndex("by_case_completed", (q) => q.eq("evalCaseId", evalCase._id))
        .order("desc")
        .first();
      // Never run is a legitimate state, and stamping nothing is the correct record
      // of it.
      if (!latestRun) continue;

      await ctx.db.patch(evalCase._id, {
        lastRunId: latestRun._id,
        lastRunStatus: latestRun.status,
        lastRunAt: latestRun.completedAt,
      });
      updated += 1;
    }

    return {
      cursor: page.continueCursor,
      isDone: page.isDone,
      processed: page.page.length,
      updated,
    };
  },


  /**
   * The same for agent memory, whose four kinds carried the same unused
   * distinction: INSTRUCTION and PREFERENCE described how the agent should
   * behave throughout, FACT and SUMMARY described something to look up.
   */
  "2026-07-26-agent-memory-apply-mode": async (ctx, cursor, batchSize) => {
    const page = await ctx.db.query("agentMemories").paginate({ cursor, numItems: batchSize });
    let updated = 0;

    for (const memory of page.page) {
      if (memory.applyMode !== undefined) continue;
      await ctx.db.patch(memory._id, { applyMode: agentKindToApplyMode(memory.kind) });
      updated += 1;
    }

    return {
      cursor: page.continueCursor,
      isDone: page.isDone,
      processed: page.page.length,
      updated,
    };
  },

  /**
   * Re-prices `agentTransactions` rows that were charged nothing for their input.
   *
   * A model whose catalogue record left `standardInputCostAbove200k` at zero had
   * that read as "free" rather than "unknown", so every call sending more than
   * two hundred thousand tokens was billed for its output alone. On one agent
   * that was twenty-two calls recorded at under a cent each against a real cost
   * of about a third of a dollar, and the agent's headline spend was seven
   * dollars light. `calculateModelCostGBP` now falls back to the standard rate,
   * so new rows are right; the rows already written keep the old number.
   *
   * Only rows the catalogue can still price are touched, and only where the
   * stored figure is materially below the recomputed one. A row that already
   * agrees, or whose model has since left the catalogue, is left exactly as it
   * is — this corrects an undercharge, it does not restate history downward.
   *
   * Cached input cannot be recovered: the proportion a provider served from
   * cache was never stored on the row, so these are re-priced at the full
   * standard rate. That over-states them slightly, which is the safe direction
   * for a figure a spend ceiling is enforced against.
   */
  "2026-08-03-reprice-unpriced-agent-transactions": async (ctx, cursor, batchSize) => {
    const page = await ctx.db.query("agentTransactions").paginate({ cursor, numItems: batchSize });
    let updated = 0;

    // One lookup per distinct model rather than per row: a batch is usually all
    // the same model, and the catalogue read is the expensive part.
    const rateCache = new Map<string, Doc<"aiModels"> | null>();
    const getRates = async (modelId: string) => {
      if (!rateCache.has(modelId)) {
        rateCache.set(
          modelId,
          await ctx.db
            .query("aiModels")
            .withIndex("by_model_id", (q) => q.eq("modelId", modelId))
            .first()
        );
      }
      return rateCache.get(modelId) ?? null;
    };

    for (const transaction of page.page) {
      const rates = await getRates(transaction.modelUsed);
      if (!rates) continue;

      const recomputed = calculateModelCostGBP({
        inputTokens: transaction.inputTokens,
        outputTokens: transaction.outputTokens,
        rates,
      });
      // Idempotent, and one-directional: a second run finds nothing left below
      // its recomputed price and changes nothing.
      if (recomputed <= transaction.costGBP + REPRICE_TOLERANCE) continue;

      await ctx.db.patch(transaction._id, { costGBP: recomputed });
      updated += 1;
    }

    return {
      cursor: page.continueCursor,
      isDone: page.isDone,
      processed: page.page.length,
      updated,
    };
  },
};

export function getRegisteredMigrationNames() {
  return Object.keys(MIGRATIONS).sort();
}

export const run = internalMutation({
  args: {
    name: v.string(),
    batchSize: v.optional(v.number()),
    /** Re-run a migration that already completed. Use deliberately. */
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (!MIGRATIONS[args.name]) {
      throw new Error(
        `Unknown migration "${args.name}". Registered: ${getRegisteredMigrationNames().join(", ") || "(none)"}`,
      );
    }

    const existing = await ctx.db
      .query("dataMigrations")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();

    if (existing && !args.force) {
      if (existing.status === "COMPLETED") {
        return { migrationId: existing._id, status: "COMPLETED" as const, alreadyComplete: true };
      }
      if (existing.status === "RUNNING") {
        return { migrationId: existing._id, status: "RUNNING" as const, alreadyComplete: false };
      }
    }

    const now = Date.now();
    // A forced or retried run restarts from the beginning; migrations are
    // idempotent, so re-examining already-migrated rows is safe.
    const migrationId = existing
      ? existing._id
      : await ctx.db.insert("dataMigrations", {
          name: args.name,
          status: "RUNNING",
          processed: 0,
          updated: 0,
          batches: 0,
          startedAt: now,
          updatedAt: now,
        });

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "RUNNING",
        cursor: undefined,
        processed: 0,
        updated: 0,
        batches: 0,
        startedAt: now,
        updatedAt: now,
        completedAt: undefined,
        error: undefined,
      });
    }

    await ctx.scheduler.runAfter(0, internal.dataMigrations.processBatch, {
      migrationId,
      batchSize: args.batchSize ?? DEFAULT_BATCH_SIZE,
    });

    return { migrationId, status: "RUNNING" as const, alreadyComplete: false };
  },
});

export const processBatch = internalMutation({
  args: {
    migrationId: v.id("dataMigrations"),
    batchSize: v.number(),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.migrationId);
    if (!record) return;
    // Someone may have marked it failed or complete between batches.
    if (record.status !== "RUNNING") return;

    const runner = MIGRATIONS[record.name];
    if (!runner) {
      await ctx.db.patch(record._id, {
        status: "FAILED",
        error: `Migration "${record.name}" is no longer registered.`,
        updatedAt: Date.now(),
      });
      return;
    }

    if (record.batches >= MAX_BATCHES) {
      await ctx.db.patch(record._id, {
        status: "FAILED",
        error: `Exceeded ${MAX_BATCHES} batches without completing.`,
        updatedAt: Date.now(),
      });
      return;
    }

    let result: MigrationBatchResult;
    try {
      result = await runner(ctx, record.cursor ?? null, args.batchSize);
    } catch (error) {
      // The thrown batch is rolled back by Convex; the cursor still points at
      // the start of it, so a retry resumes from the same place.
      await ctx.db.patch(record._id, {
        status: "FAILED",
        error: error instanceof Error ? error.message : "Unknown migration error",
        updatedAt: Date.now(),
      });
      return;
    }

    const now = Date.now();
    const processed = record.processed + result.processed;
    const updated = record.updated + result.updated;
    const batches = record.batches + 1;

    if (result.isDone) {
      await ctx.db.patch(record._id, {
        status: "COMPLETED",
        cursor: undefined,
        processed,
        updated,
        batches,
        updatedAt: now,
        completedAt: now,
      });
      return;
    }

    await ctx.db.patch(record._id, {
      cursor: result.cursor ?? undefined,
      processed,
      updated,
      batches,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.dataMigrations.processBatch, {
      migrationId: record._id,
      batchSize: args.batchSize,
    });
  },
});

// Declared with `superAdminQuery` rather than `query` + a guard call, so the
// role check cannot be omitted and authzEnforcement.test.ts can verify it
// structurally. See convex/tenantFunctions.ts.
export const getStatus = superAdminQuery({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("dataMigrations")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();
  },
});

export const listStatus = superAdminQuery({
  args: {},
  handler: async (ctx) => {
    const applied = await ctx.db.query("dataMigrations").take(1000);
    const appliedByName = new Map(applied.map((record) => [record.name, record]));

    // Registered-but-never-run migrations are the interesting ones during a
    // release, so report them rather than only what has already executed.
    return getRegisteredMigrationNames().map((name) => ({
      name,
      status: appliedByName.get(name)?.status ?? "NOT_RUN",
      processed: appliedByName.get(name)?.processed ?? 0,
      updated: appliedByName.get(name)?.updated ?? 0,
      completedAt: appliedByName.get(name)?.completedAt,
      error: appliedByName.get(name)?.error,
    }));
  },
});
