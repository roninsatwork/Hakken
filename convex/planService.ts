import { normalizeEnabledModules } from "./utils/companyModules";
import type { Doc } from "./_generated/dataModel";

export interface PlanStatus {
  planName: string;
  messageLimit: number;
  messagesUsed: number;
}

export const DEFAULT_PLAN_STATUS: PlanStatus = {
  planName: "System Default",
  messageLimit: -1,
  messagesUsed: 0,
};

export function getPlanStatusFromUser(args: {
  user: Doc<"users">;
  userPlan?: Doc<"plans"> | null;
  company?: Doc<"companies"> | null;
  companyPlan?: Doc<"plans"> | null;
}): PlanStatus {
  if (args.user.planOverrideId) {
    return {
      planName: args.userPlan ? `Custom ${args.userPlan.name}` : DEFAULT_PLAN_STATUS.planName,
      messageLimit: args.userPlan?.messageLimit ?? DEFAULT_PLAN_STATUS.messageLimit,
      messagesUsed: args.user.messagesUsedThisPeriod || 0,
    };
  }

  if (args.user.companyId) {
    return getPlanStatusFromCompany(args.company, args.companyPlan);
  }

  return DEFAULT_PLAN_STATUS;
}

export function getPlanStatusFromCompany(company?: Doc<"companies"> | null, plan?: Doc<"plans"> | null): PlanStatus {
  if (!company) return DEFAULT_PLAN_STATUS;

  return {
    planName: plan?.name ?? DEFAULT_PLAN_STATUS.planName,
    messageLimit: plan?.messageLimit ?? DEFAULT_PLAN_STATUS.messageLimit,
    messagesUsed: company.messagesUsedThisPeriod || 0,
  };
}

export function buildPlanRecord(args: {
  name: string;
  description?: string;
  messageLimit: number;
  priceGBP: number;
  grantedModules?: string[];
  isActive: boolean;
}, now = Date.now()) {
  return {
    name: args.name,
    description: args.description,
    messageLimit: args.messageLimit,
    priceGBP: args.priceGBP,
    // Same laundering as a company's own list: unknown keys stay out of the
    // database, where they would read as a capability nobody can find.
    grantedModules: normalizeEnabledModules(args.grantedModules),
    isActive: args.isActive,
    createdAt: now,
  };
}

export function getAssignedPlanDeleteErrorMessage(companyCount: number) {
  return `Cannot delete this plan. It is actively assigned to ${companyCount} companies.`;
}
