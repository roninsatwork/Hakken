import type { Edge, Node } from "@xyflow/react";
import type { Id } from "@/convex/_generated/dataModel";

export type WorkflowTriggerType = "MANUAL" | "WEBHOOK" | "SCHEDULE";
export type WorkflowNodeType =
  | "triggerNode"
  | "agentNode"
  | "actionNode"
  | "logicNode"
  | "databaseNode"
  | "iteratorNode"
  | "mergeNode"
  | "waitNode"
  | "approvalNode"
  | "emailNode"
  | string;

export type WorkflowHeaderConfig = {
  key: string;
  value: string;
};

export type WorkflowActionConfig = {
  method: string;
  url: string;
  headers: WorkflowHeaderConfig[];
  body: string;
};

export type WorkflowDatabaseConfig = {
  operation: "INSERT" | "UPDATE" | "DELETE" | "SELECT";
  tableName: string;
  docId?: string;
};

export type WorkflowLogicRule = {
  variable: string;
  operator: "EQUALS" | "NOT_EQUALS" | "CONTAINS" | "GREATER_THAN" | "LESS_THAN" | "IS_EMPTY" | "NOT_EMPTY";
  value: string;
  branch: string;
};

export type WorkflowLogicConfig = {
  rules: WorkflowLogicRule[];
  fallbackBranch: string;
};

export type WorkflowIteratorConfig = {
  listVariable: string;
};

export type WorkflowMergeConfig = {
  mode: "WAIT_FOR_ANY" | "WAIT_FOR_ALL";
};

export type WorkflowWaitConfig = {
  delaySeconds: string;
};

export type WorkflowApprovalConfig = {
  message: string;
  previewTarget: string;
};

export type WorkflowEmailConfig = {
  from: string;
  to: string;
  subject: string;
  body: string;
};

export type WorkflowCanvasNodeData = {
  label?: string;
  avatar?: string;
  modelId?: string;
  inputSchema?: string;
  outputSchema?: string;
  _agentId?: Id<"agents">;
  isInline?: boolean;
  _inputMapping?: string | Record<string, unknown>;
  _inputTemplate?: string;
  _triggerType?: WorkflowTriggerType;
  _scheduleInterval?: string;
  _webhookSecret?: string;
  _actionConfig?: WorkflowActionConfig;
  _dbConfig?: WorkflowDatabaseConfig;
  _logicConfig?: WorkflowLogicConfig;
  _iteratorConfig?: WorkflowIteratorConfig;
  _mergeConfig?: WorkflowMergeConfig;
  _waitConfig?: WorkflowWaitConfig;
  _approvalConfig?: WorkflowApprovalConfig;
  _emailConfig?: WorkflowEmailConfig;
};

export type WorkflowCanvasNode = Node<WorkflowCanvasNodeData, WorkflowNodeType>;
export type WorkflowCanvasEdge = Edge;

export type UpdatableWorkflowNodeData = WorkflowCanvasNodeData & Record<string, unknown>;

export type WorkflowNodeUpdateHandler = (nodeId: string, data: UpdatableWorkflowNodeData) => void;
