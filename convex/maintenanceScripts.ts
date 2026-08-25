import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { getRegisteredMigrationNames } from "./dataMigrations";
import { rebuildGlobalInventoryRollupData } from "./inventoryRollups";
// template:remove:start salesData
import { provisionComaxAgents } from "./salesDataComaxProvisioning";
// template:remove:end
import {
  getMaintenanceScriptDefinition,
  maintenanceScriptDefinitions,
  type MaintenanceScriptId,
} from "./maintenanceScriptRegistry";
import { appError } from "./utils/appError";

type ScriptRunResult = {
  summary: string;
  metadata: Record<string, string | number | boolean>;
};

async function executeMaintenanceScript(
  ctx: MutationCtx,
  scriptId: MaintenanceScriptId,
  actorId: Id<"users">,
): Promise<ScriptRunResult> {
  if (scriptId === "inventory-rollup-rebuild") {
    const result = await rebuildGlobalInventoryRollupData(ctx);

    return {
      summary: `Inventory rollup rebuilt for ${result.totalProvisionedCompanies} companies and ${result.totalProvisionedUsers} users.`,
      metadata: result,
    };
  }

  if (scriptId === "data-migrations-apply") {
    return await startPendingDataMigrations(ctx);
  }

  // template:remove:start salesData
  if (scriptId === "comax-agents-provision") {
    return await provisionComaxAgents(ctx, actorId);
  }
  // template:remove:end

  throw appError("INVALID_INPUT", "Unknown maintenance script");
}

/**
 * Start every registered data migration that has not completed.
 *
 * Migrations run in pages via the scheduler, so this cannot report a finished
 * result: it reports what it started and the state of the ledger at that
 * moment. The script's run record therefore means "started successfully", not
 * "finished" — the summary says so explicitly rather than implying completion.
 */
async function startPendingDataMigrations(ctx: MutationCtx): Promise<ScriptRunResult> {
  const ledger = await ctx.db.query("dataMigrations").take(1000);
  const ledgerByName = new Map(ledger.map((record) => [record.name, record]));

  const started: string[] = [];
  const alreadyComplete: string[] = [];
  const inProgress: string[] = [];

  for (const name of getRegisteredMigrationNames()) {
    const record = ledgerByName.get(name);

    if (record?.status === "COMPLETED") {
      alreadyComplete.push(name);
      continue;
    }
    if (record?.status === "RUNNING") {
      // Already working through its pages; starting it again would reset it.
      inProgress.push(name);
      continue;
    }

    // Never run, or previously FAILED: (re)start it. Migrations are idempotent,
    // so restarting a failed one re-examines already-migrated records safely.
    await ctx.scheduler.runAfter(0, internal.dataMigrations.run, { name, force: true });
    started.push(name);
  }

  const summaryParts: string[] = [];
  if (started.length > 0) {
    summaryParts.push(
      `Started ${started.length} migration${started.length === 1 ? "" : "s"} (${started.join(", ")}). These continue in the background — re-run this script to see progress.`,
    );
  }
  if (inProgress.length > 0) {
    summaryParts.push(`${inProgress.length} already running and left alone.`);
  }
  if (alreadyComplete.length > 0) {
    summaryParts.push(`${alreadyComplete.length} already complete.`);
  }
  if (summaryParts.length === 0) {
    summaryParts.push("No data migrations are registered.");
  }

  return {
    summary: summaryParts.join(" "),
    metadata: {
      started: started.join(", ") || "none",
      alreadyRunning: inProgress.join(", ") || "none",
      alreadyComplete: alreadyComplete.join(", ") || "none",
      registeredCount: getRegisteredMigrationNames().length,
      recordsUpdatedSoFar: ledger.reduce((total, record) => total + record.updated, 0),
    },
  };
}

function getActorLabel(user: Doc<"users">) {
  return user.name || user.email || "Super Admin";
}

async function getLatestRunForScript(ctx: Pick<QueryCtx, "db">, scriptId: string) {
  return await ctx.db
    .query("maintenanceScriptRuns")
    .withIndex("by_script_started", (q) => q.eq("scriptId", scriptId))
    .order("desc")
    .first();
}

export const list = superAdminQuery({
  args: {},
  handler: async (ctx) => {
    return await Promise.all(
      maintenanceScriptDefinitions.map(async (script) => ({
        ...script,
        lastRun: await getLatestRunForScript(ctx, script.id),
      }))
    );
  },
});

export const get = superAdminQuery({
  args: { scriptId: v.string() },
  handler: async (ctx, args) => {
    const script = getMaintenanceScriptDefinition(args.scriptId);
    if (!script) return null;

    const history = await ctx.db
      .query("maintenanceScriptRuns")
      .withIndex("by_script_started", (q) => q.eq("scriptId", script.id))
      .order("desc")
      .take(10);

    return {
      ...script,
      lastRun: history[0] ?? null,
      history,
    };
  },
});

export const run = superAdminMutation({
  args: { scriptId: v.string() },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;
    const script = getMaintenanceScriptDefinition(args.scriptId);
    if (!script) {
      throw appError("INVALID_INPUT", "Unknown maintenance script");
    }

    const startedAt = Date.now();
    const actorName = getActorLabel(user);
    const runId = await ctx.db.insert("maintenanceScriptRuns", {
      scriptId: script.id,
      status: "RUNNING",
      startedAt,
      actorId: userId,
      actorName,
      actorEmail: user.email,
    });

    await ctx.db.insert("auditLogs", {
      actionType: "MAINTENANCE_SCRIPT_STARTED",
      actorId: userId,
      entityType: "maintenanceScripts",
      entityId: script.id,
      timestamp: startedAt,
      metadata: JSON.stringify({ scriptId: script.id, scriptName: script.name }),
    });

    try {
      const result = await executeMaintenanceScript(ctx, script.id, userId);
      const completedAt = Date.now();
      const metadata = JSON.stringify(result.metadata);

      await ctx.db.patch(runId, {
        status: "SUCCESS",
        completedAt,
        summary: result.summary,
        metadata,
      });
      await ctx.db.insert("auditLogs", {
        actionType: "MAINTENANCE_SCRIPT_SUCCEEDED",
        actorId: userId,
        entityType: "maintenanceScripts",
        entityId: script.id,
        timestamp: completedAt,
        metadata: JSON.stringify({
          scriptId: script.id,
          scriptName: script.name,
          runId,
          result: result.metadata,
        }),
      });

      return {
        success: true,
        runId,
        summary: result.summary,
      };
    } catch (error) {
      const completedAt = Date.now();
      const message = error instanceof Error ? error.message : "Maintenance script failed";

      await ctx.db.patch(runId, {
        status: "FAILED",
        completedAt,
        error: message,
      });
      await ctx.db.insert("auditLogs", {
        actionType: "MAINTENANCE_SCRIPT_FAILED",
        actorId: userId,
        entityType: "maintenanceScripts",
        entityId: script.id,
        timestamp: completedAt,
        metadata: JSON.stringify({
          scriptId: script.id,
          scriptName: script.name,
          runId,
          error: message,
        }),
      });

      return {
        success: false,
        runId,
        error: message,
      };
    }
  },
});
