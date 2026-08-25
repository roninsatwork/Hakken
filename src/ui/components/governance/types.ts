import type { Id } from "@/convex/_generated/dataModel";

export type AuditLogRow = {
  _id: string | Id<"auditLogs">;
  actionType: string;
  actorName?: string;
  entityId?: string;
  entityType?: string;
  actorId?: Id<"users">;
  timestamp: number;
  metadata?: string;
};
