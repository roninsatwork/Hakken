import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { stripLegacySharedLearningNotes } from "./utils/agentPromptScope";

type SnapshotPart = Record<string, unknown>;

function isRecord(value: unknown): value is SnapshotPart {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Old snapshots predate company scoping. Check each old item against its
 * current owner before a company admin reads it or a company run replays it. */
export async function scopeAgentVersionSnapshot(
  ctx: Pick<QueryCtx, "db">,
  version: Doc<"agentVersions">,
): Promise<Doc<"agentVersions">> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(version.snapshotJson);
  } catch {
    return { ...version, snapshotJson: "{}" };
  }
  if (!isRecord(parsed)) return { ...version, snapshotJson: "{}" };
  if (parsed.tenantSafeVersion === 2) return version;

  const sameCompany = version.companyId;
  const rules = Array.isArray(parsed.rules) ? parsed.rules.slice(0, 200) : [];
  const safeRules = (await Promise.all(rules.map(async (entry: unknown) => {
    if (!isRecord(entry) || typeof entry.id !== "string") return null;
    try {
      const rule = await ctx.db.get(entry.id as Id<"aiRules">);
      return rule?.agentId === version.agentId && rule.companyId === sameCompany ? entry : null;
    } catch {
      return null;
    }
  }))).filter((entry) => entry !== null);

  const oldMemory = isRecord(parsed.memory) ? parsed.memory : {};
  const items = Array.isArray(oldMemory.items) ? oldMemory.items.slice(0, 25) : [];
  const safeItems = (await Promise.all(items.map(async (entry: unknown) => {
    if (!isRecord(entry) || typeof entry.id !== "string") return null;
    try {
      const memory = await ctx.db.get(entry.id as Id<"agentMemories">);
      return memory?.agentId === version.agentId && memory.companyId === sameCompany ? entry : null;
    } catch {
      return null;
    }
  }))).filter((entry) => entry !== null);

  const prompt = isRecord(parsed.prompt) ? parsed.prompt : {};
  const safePrompt = typeof prompt.systemPrompt === "string"
    ? stripLegacySharedLearningNotes(prompt.systemPrompt)
    : undefined;
  return {
    ...version,
    snapshotJson: JSON.stringify({
      ...parsed,
      prompt: { ...prompt, systemPrompt: safePrompt },
      rules: safeRules,
      memory: { activeCount: safeItems.length, items: safeItems },
    }),
  };
}
