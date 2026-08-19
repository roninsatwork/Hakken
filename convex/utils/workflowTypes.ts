import type { Id } from "../_generated/dataModel";
import { isRecord } from "./lang";

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

const WORKFLOW_TRIGGER_TYPES = new Set(["MANUAL", "WEBHOOK", "SCHEDULE"]);
const MERGE_MODES = new Set(["WAIT_FOR_ANY", "WAIT_FOR_ALL"]);


function parseJson<T>(json: string | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function parseJsonUnknown(json: string | undefined): unknown {
  if (!json) return undefined;
  return JSON.parse(json) as unknown;
}

function isWorkflowNodeData(value: unknown): value is WorkflowNodeData {
  if (!isRecord(value)) return false;

  if (
    typeof value._triggerType !== "undefined" &&
    (typeof value._triggerType !== "string" || !WORKFLOW_TRIGGER_TYPES.has(value._triggerType))
  ) {
    return false;
  }

  if (typeof value._mergeConfig !== "undefined") {
    if (!isRecord(value._mergeConfig)) return false;
    const mode = value._mergeConfig.mode;
    if (typeof mode !== "undefined" && (typeof mode !== "string" || !MERGE_MODES.has(mode))) {
      return false;
    }
  }

  return true;
}

function toWorkflowNode(value: unknown): WorkflowNode | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  if (typeof value.type !== "undefined" && typeof value.type !== "string") return null;
  if (typeof value.data !== "undefined" && !isWorkflowNodeData(value.data)) return null;

  return {
    id: value.id,
    ...(typeof value.type === "string" ? { type: value.type } : {}),
    ...(isWorkflowNodeData(value.data) ? { data: value.data } : {}),
  };
}

function toWorkflowEdge(value: unknown): WorkflowEdge | null {
  if (!isRecord(value) || typeof value.source !== "string" || typeof value.target !== "string") return null;
  return { source: value.source, target: value.target };
}

function assertJsonArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be a JSON array.`);
  }

  return value;
}

export function parseWorkflowNodes(json: string | undefined): WorkflowNode[] {
  const parsed = parseJson<unknown>(json, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((value) => {
    const node = toWorkflowNode(value);
    return node ? [node] : [];
  });
}

export function parseWorkflowEdges(json: string | undefined): WorkflowEdge[] {
  const parsed = parseJson<unknown>(json, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((value) => {
    const edge = toWorkflowEdge(value);
    return edge ? [edge] : [];
  });
}

export function validateWorkflowNodesJson(json: string | undefined): WorkflowNode[] {
  const parsed = assertJsonArray(parseJsonUnknown(json), "Workflow nodes");

  return parsed.map((value, index) => {
    const node = toWorkflowNode(value);
    if (!node) {
      throw new Error(`Workflow node at index ${index} must include a string id, optional string type, and valid data object.`);
    }
    return node;
  });
}

export function validateWorkflowEdgesJson(json: string | undefined): WorkflowEdge[] {
  const parsed = assertJsonArray(parseJsonUnknown(json), "Workflow edges");

  return parsed.map((value, index) => {
    const edge = toWorkflowEdge(value);
    if (!edge) {
      throw new Error(`Workflow edge at index ${index} must include string source and target node ids.`);
    }
    return edge;
  });
}

export function parseWorkflowState(json: string | undefined): WorkflowStatePayload {
  const parsed = parseJson<unknown>(json, {});
  return isRecord(parsed) ? (parsed as WorkflowStatePayload) : {};
}

export function parseWorkflowOutput(json: string | undefined): WorkflowNodeOutput {
  const parsed = parseJson<unknown>(json, {});
  return isRecord(parsed) ? (parsed as WorkflowNodeOutput) : {};
}
