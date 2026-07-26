import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const VERSION_SNAPSHOT_LIMIT = 200;

type VersioningCtx = Pick<MutationCtx, "db">;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(",")}}`;
}

function hashString(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) + value.charCodeAt(index);
    hash &= 0xffffffff;
  }
  return (hash >>> 0).toString(36);
}

function hashValue(value: unknown) {
  return hashString(stableStringify(value));
}

export async function ensureAgentVersionSnapshot(ctx: VersioningCtx, args: {
  agentId: Id<"agents">;
  companyId?: Id<"companies">;
}) {
  const agent = await ctx.db.get(args.agentId);
  if (!agent) throw new Error("Agent not found");

  const [bindings, rules, memories] = await Promise.all([
    ctx.db
      .query("agentTools")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .take(VERSION_SNAPSHOT_LIMIT),
    ctx.db
      .query("aiRules")
      .withIndex("by_agent_active_created", (q) => q.eq("agentId", args.agentId).eq("isActive", true))
      .order("desc")
      .take(VERSION_SNAPSHOT_LIMIT),
    args.companyId
      ? ctx.db
          .query("agentMemories")
          .withIndex("by_agent_company_active_updated", (q) =>
            q.eq("agentId", args.agentId).eq("companyId", args.companyId).eq("isActive", true)
          )
          .order("desc")
          .take(VERSION_SNAPSHOT_LIMIT)
      : ctx.db
          .query("agentMemories")
          .withIndex("by_agent_active_updated", (q) => q.eq("agentId", args.agentId).eq("isActive", true))
          .order("desc")
	      .take(VERSION_SNAPSHOT_LIMIT),
  ]);
  const skillBindings = await ctx.db
    .query("agentSkillBindings")
    .withIndex("by_agent_enabled", (q) => q.eq("agentId", args.agentId).eq("isEnabled", true))
    .take(VERSION_SNAPSHOT_LIMIT);
  const tools = await Promise.all(bindings.map(async (binding) => {
    const tool = await ctx.db.get(binding.toolId);
    return tool ? {
      id: tool._id,
      name: tool.name,
      description: tool.description,
      handlerMapping: tool.handlerMapping,
      requiredRole: tool.requiredRole,
      sideEffectLevel: tool.sideEffectLevel,
      confirmationRequired: tool.confirmationRequired,
      inputSchema: tool.inputSchema,
      isActive: tool.isActive,
      version: tool.version,
      updatedAt: tool.updatedAt,
	    } : null;
  }));
  const skills = await Promise.all(skillBindings
    .filter((binding) => !binding.companyId || binding.companyId === args.companyId)
    .map(async (binding) => {
      const [skill, version] = await Promise.all([
        ctx.db.get(binding.skillId),
        ctx.db.get(binding.skillVersionId),
      ]);
      if (!skill || skill.status !== "ACTIVE") return null;

      let parsedSnapshot: {
        requiredToolMappings?: string[];
        recommendedToolMappings?: string[];
      } = {};
      try {
        const parsed = version?.snapshotJson ? JSON.parse(version.snapshotJson) as unknown : {};
        parsedSnapshot = parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed as typeof parsedSnapshot
          : {};
      } catch {
        parsedSnapshot = {};
      }

      return {
        id: skill._id,
        versionId: binding.skillVersionId,
        bindingId: binding._id,
        companyId: binding.companyId,
        name: skill.name,
        category: skill.category,
        riskLevel: skill.riskLevel,
        instruction: skill.instruction,
        requiredToolMappings: Array.isArray(parsedSnapshot.requiredToolMappings)
          ? parsedSnapshot.requiredToolMappings
          : [],
        recommendedToolMappings: Array.isArray(parsedSnapshot.recommendedToolMappings)
          ? parsedSnapshot.recommendedToolMappings
          : [],
        versionNumber: version?.versionNumber,
        snapshotHash: version?.snapshotHash,
      };
    }));

  const promptSnapshot = {
    systemPrompt: agent.systemPrompt || "",
    inputSchema: agent.inputSchema,
    outputSchema: agent.outputSchema,
  };
  const toolSnapshot = tools
    .filter((tool): tool is NonNullable<typeof tool> => tool !== null)
    .sort((left, right) => left.handlerMapping.localeCompare(right.handlerMapping));
  const memorySnapshot = {
    companyId: args.companyId,
    activeCount: memories.length,
    latestUpdatedAt: memories[0]?.updatedAt,
    kinds: memories.reduce<Record<string, number>>((counts, memory) => {
      counts[memory.kind] = (counts[memory.kind] ?? 0) + 1;
      return counts;
    }, {}),
    items: memories.slice(0, 25).map((memory) => ({
      id: memory._id,
      kind: memory.kind,
      content: memory.content,
      importance: memory.importance,
      updatedAt: memory.updatedAt,
    })),
  };
  const ruleSnapshot = rules
    .map((rule) => ({
      id: rule._id,
      name: rule.name,
      trigger: rule.trigger,
      instruction: rule.instruction,
      priority: rule.priority,
	    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const skillSnapshot = skills
    .filter((skill): skill is NonNullable<typeof skill> => skill !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
  const modelSnapshot = {
    modelId: agent.modelId,
    modelSelectionMode: agent.modelSelectionMode,
    reasoningEffort: agent.reasoningEffort,
    temperature: agent.temperature,
    thinkingMode: agent.thinkingMode,
  };
  const policySnapshot = {
    humanApprovalRequired: agent.humanApprovalRequired,
    // Captured so a rollback restores the intent. A release that silently turned
    // autonomy on, or off, behind the operator's back would be a worse fault
    // than the one autonomy was added to fix.
    autonomousToolExecution: agent.autonomousToolExecution,
    approvalExpiryHours: agent.approvalExpiryHours,
    // The run budget lives here rather than in its own section so it is covered
    // by the existing policy hash. It belongs with policy in any case: once an
    // agent is autonomous these four are the only thing bounding what it does.
    maxSteps: agent.maxSteps,
    maxToolCalls: agent.maxToolCalls,
    maxRuntimeMs: agent.maxRuntimeMs,
    maxCostGBP: agent.maxCostGBP,
    allowInternetAccess: agent.allowInternetAccess,
    triggerType: agent.triggerType,
  };
  const snapshot = {
    agent: {
      id: agent._id,
      name: agent.name,
      description: agent.description,
      isActive: agent.isActive,
      updatedAt: agent.updatedAt,
    },
    companyId: args.companyId,
    prompt: promptSnapshot,
    tools: toolSnapshot,
    skills: skillSnapshot,
    rules: ruleSnapshot,
    memory: memorySnapshot,
    model: modelSnapshot,
    policy: policySnapshot,
  };

  const promptHash = hashValue(promptSnapshot);
  const toolSetHash = hashValue(toolSnapshot);
  const skillSetHash = hashValue(skillSnapshot);
  const memoryRevisionHash = hashValue(memorySnapshot);
  const ruleSetHash = hashValue(ruleSnapshot);
  const modelConfigHash = hashValue(modelSnapshot);
  const policyHash = hashValue(policySnapshot);
  const snapshotJson = stableStringify(snapshot);
  const snapshotHash = hashString(snapshotJson);

  const existing = await ctx.db
    .query("agentVersions")
    .withIndex("by_agent_hash", (q) => q.eq("agentId", args.agentId).eq("snapshotHash", snapshotHash))
    .first();
  if (existing) return existing._id;

  const latest = await ctx.db
    .query("agentVersions")
    .withIndex("by_agent_created", (q) => q.eq("agentId", args.agentId))
    .order("desc")
    .first();
  const now = Date.now();
  return await ctx.db.insert("agentVersions", {
    agentId: args.agentId,
    companyId: args.companyId,
    versionNumber: (latest?.versionNumber ?? 0) + 1,
    snapshotHash,
    snapshotJson,
    promptHash,
    toolSetHash,
    skillSetHash,
    memoryRevisionHash,
    ruleSetHash,
    modelConfigHash,
    policyHash,
    createdAt: now,
  });
}
