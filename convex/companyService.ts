import type { Doc } from "./_generated/dataModel";

export function buildCompanyRecord(args: { name: string; systemPrompt?: string }, now = Date.now()) {
  return {
    name: args.name,
    systemPrompt: args.systemPrompt,
    createdAt: now,
  };
}

export function buildCompanyProfilePatch(args: {
  name: string;
  description?: string;
  overview?: string;
}) {
  return {
    name: args.name,
    description: args.description,
    overview: args.overview,
  };
}

export function withCompanyUserCount(company: Doc<"companies">, userCount: number) {
  return {
    ...company,
    userCount,
  };
}

export function buildCreateCompanyAuditMetadata(name: string) {
  return JSON.stringify({ name });
}

export function buildUpdateCompanyAuditMetadata(args: { previousName?: string; newName: string }) {
  return JSON.stringify({ previousName: args.previousName, newName: args.newName });
}

export function buildDeleteCompanyAuditMetadata(name?: string) {
  return JSON.stringify({ name });
}

export function shouldContinueCompanyPurge(args: { userBatchSize: number; inviteBatchSize: number }, batchLimit = 100) {
  return args.userBatchSize === batchLimit || args.inviteBatchSize === batchLimit;
}
