import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireSuperAdmin } from "./authz";
import { rebuildGlobalInventoryRollupData } from "./inventoryRollups";
import {
  getMaintenanceScriptDefinition,
  maintenanceScriptDefinitions,
  type MaintenanceScriptId,
} from "./maintenanceScriptRegistry";

type ScriptRunResult = {
  summary: string;
  metadata: Record<string, string | number | boolean>;
};

async function executeMaintenanceScript(ctx: MutationCtx, scriptId: MaintenanceScriptId): Promise<ScriptRunResult> {
  if (scriptId === "inventory-rollup-rebuild") {
    const result = await rebuildGlobalInventoryRollupData(ctx);

    return {
      summary: `Inventory rollup rebuilt for ${result.totalProvisionedCompanies} companies and ${result.totalProvisionedUsers} users.`,
      metadata: result,
    };
  }

  throw new Error("Unknown maintenance script");
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

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthorized");

    return await Promise.all(
      maintenanceScriptDefinitions.map(async (script) => ({
        ...script,
        lastRun: await getLatestRunForScript(ctx, script.id),
      }))
    );
  },
});

export const get = query({
  args: { scriptId: v.string() },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthorized");

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

export const run = mutation({
  args: { scriptId: v.string() },
  handler: async (ctx, args) => {
    const { userId, user } = await requireSuperAdmin(ctx, "Unauthorized", "Unauthorized");
    const script = getMaintenanceScriptDefinition(args.scriptId);
    if (!script) {
      throw new Error("Unknown maintenance script");
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
      const result = await executeMaintenanceScript(ctx, script.id);
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
