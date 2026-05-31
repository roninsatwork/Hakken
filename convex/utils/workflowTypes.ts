import type { Id } from "../_generated/dataModel";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export type WorkflowNodeData = {
  _agentId?: Id<"agents">;
  _triggerType?: "MANUAL" | "WEBHOOK" | "SCHEDULE";
  _scheduleInterval?: string;
  _mergeConfig?: {
    mode?: "WAIT_FOR_ANY" | "WAIT_FOR_ALL";
  };
  [key: string]: unknown;
};

export type WorkflowNode = {
  id: string;
  type?: string;
  data?: WorkflowNodeData;
};

export type WorkflowEdge = {
  source: string;
  target: string;
};

export type WorkflowStatePayload = {
  trigger?: unknown;
  nodes?: Record<string, { output: unknown }>;
  [key: string]: unknown;
};

export type WorkflowNodeOutput = {
  _system?: {
    halt?: boolean;
    isIterator?: boolean;
    delayMs?: number;
    [key: string]: unknown;
  };
  evaluated?: unknown;
  items?: unknown[];
  [key: string]: unknown;
};

function parseJson<T>(json: string | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export function parseWorkflowNodes(json: string | undefined) {
  return parseJson<WorkflowNode[]>(json, []);
}

export function parseWorkflowEdges(json: string | undefined) {
  return parseJson<WorkflowEdge[]>(json, []);
}

export function parseWorkflowState(json: string | undefined) {
  return parseJson<WorkflowStatePayload>(json, {});
}

export function parseWorkflowOutput(json: string | undefined) {
  return parseJson<WorkflowNodeOutput>(json, {});
}
