import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { assertAgentVisibleToCompany } from "./agentService";
import { getActiveCompanyId } from "./authz";
import { assertCanAccessKnowledgeScope } from "./knowledgeService";
import { appError } from "./utils/appError";

/**
 * Who may read or write an agent's knowledge (Sonae `2a05a33b`; wiki-sonae-catch-up-plan-2026-11-21.md, 0.2). A company
 * admin reaches only an agent their company can see: a shared agent, or their own company's. A super admin reaches any.
 * Before this, an admin who knew another company's agent's id could list and add to its knowledge.
 */
type KnowledgeAccessCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;
type KnowledgeScopeArgs = { companyId?: Id<"companies">; agentId?: Id<"agents"> };

export async function requireKnowledgeAgentAccess(ctx: KnowledgeAccessCtx, user: Doc<"users">, agentId: Id<"agents">) {
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") throw appError("UNAUTHORIZED", "Unauthorized");
  const agent = await ctx.db.get(agentId);
  if (user.role === "ADMIN") assertAgentVisibleToCompany(agent, getActiveCompanyId(user));
  if (!agent) throw appError("NOT_FOUND", "Agent not found.");
  return agent;
}

/** Where a document an admin adds is filed: their company, the agent they may reach, or the platform for a super admin. */
export async function getWritableKnowledgeScope(ctx: Pick<MutationCtx, "db">, user: Doc<"users">, args: KnowledgeScopeArgs) {
  const companyId = args.companyId || (args.agentId && user.role === "ADMIN" ? getActiveCompanyId(user) : undefined);
  assertCanAccessKnowledgeScope(user, companyId);
  if (args.agentId) await requireKnowledgeAgentAccess(ctx, user, args.agentId);
  return { companyId, agentId: args.agentId };
}
