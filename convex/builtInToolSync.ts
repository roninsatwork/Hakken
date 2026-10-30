import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { syncConnectorTools } from "./aiTools";
import { getBuiltInToolConnector } from "./toolConnectorDefinitions";

/** As many tool rows as a connector's catalogue reads (`aiTools.ts`). */
const TOOL_CATALOG_LIMIT = 250;

/**
 * A built-in connector already installed, given the tools its definition has
 * gained since: each tool with no row at all is added and switched on, as an
 * install would have. A tool an administrator switched off has a row, so it
 * stays off. Without this a new tool in an installed connector never reached
 * anyone (hakken-tasks-plan.md, item 4.1). A tool whose definition changed — its
 * description or its settings, as the chart's did on 2026-10-31 when it gained
 * Google Analytics — is written again, or the model never learns what changed.
 * Returns how many it added.
 */
export async function addNewBuiltInTools(ctx: MutationCtx, connector: Doc<"toolConnectors">, addedBy?: Id<"users">): Promise<number> {
  const definition = getBuiltInToolConnector(connector.key);
  const createdBy = connector.createdBy ?? addedBy;
  if (!definition || !createdBy) return 0;
  const existing = await ctx.db
    .query("aiTools")
    .withIndex("by_connector", (q) => q.eq("connectorId", connector._id))
    .take(TOOL_CATALOG_LIMIT);
  const known = new Set(existing.map((tool) => tool.handlerMapping));
  const added = definition.toolDefinitions.map((tool) => tool.handlerMapping).filter((mapping) => !known.has(mapping));
  const byMapping = new Map(existing.map((tool) => [tool.handlerMapping, tool]));
  const changed = definition.toolDefinitions.some((tool) => {
    const row = byMapping.get(tool.handlerMapping);
    return row !== undefined && row.isActive !== false && (row.description !== tool.description || (row.inputSchema ?? undefined) !== (tool.inputSchema?.trim() || undefined));
  });
  if (added.length === 0 && changed) {
    await syncConnectorTools(ctx, { connector, enabledToolMappings: connector.enabledToolMappings ?? definition.toolDefinitions.map((tool) => tool.handlerMapping), createdBy, now: Date.now() });
    return 0;
  }
  if (added.length === 0) return 0;
  const enabledToolMappings = [...new Set([...(connector.enabledToolMappings ?? []), ...added])];
  const now = Date.now();
  await ctx.db.patch(connector._id, { enabledToolMappings, updatedAt: now });
  await syncConnectorTools(ctx, { connector: { ...connector, enabledToolMappings }, enabledToolMappings, createdBy, now });
  return added.length;
}
