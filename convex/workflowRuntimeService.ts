import { resolveTemplate } from "./utils/templateParser";
import {
  parseWorkflowOutput,
  parseWorkflowState,
  type WorkflowEdge,
  type WorkflowNodeData,
  type WorkflowNodeOutput,
  type WorkflowStatePayload,
} from "./utils/workflowTypes";

export type LogicConfig = {
  fallbackBranch?: string;
  rules?: Array<{
    variable: string;
    value?: string;
    operator: "EQUALS" | "NOT_EQUALS" | "CONTAINS" | "GREATER_THAN" | "LESS_THAN" | "IS_EMPTY" | "NOT_EMPTY";
    branch: string;
  }>;
};

export type WaitConfig = {
  delaySeconds?: number | string;
};

export type ApprovalConfig = {
  message?: string;
  previewTarget?: string;
};

export type IteratorConfig = {
  listVariable?: string;
};

export type WorkflowRuntimeContext = {
  globalStatePayload: WorkflowStatePayload;
  resolvedInput: string;
  currentNodeData: WorkflowNodeData;
};

export type MergeStepInput = {
  nodeId: string;
  output?: string;
  status: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isLogicConfig(value: unknown): value is LogicConfig {
  if (!isRecord(value)) return false;
  if (typeof value.fallbackBranch !== "undefined" && typeof value.fallbackBranch !== "string") return false;
  if (typeof value.rules === "undefined") return true;
  if (!Array.isArray(value.rules)) return false;

  return value.rules.every(
    (rule) =>
      isRecord(rule) &&
      typeof rule.variable === "string" &&
      typeof rule.operator === "string" &&
      typeof rule.branch === "string"
  );
}

function isWaitConfig(value: unknown): value is WaitConfig {
  if (!isRecord(value)) return false;
  const delaySeconds = value.delaySeconds;
  return typeof delaySeconds === "undefined" || typeof delaySeconds === "string" || typeof delaySeconds === "number";
}

function isApprovalConfig(value: unknown): value is ApprovalConfig {
  if (!isRecord(value)) return false;
  return (
    (typeof value.message === "undefined" || typeof value.message === "string") &&
    (typeof value.previewTarget === "undefined" || typeof value.previewTarget === "string")
  );
}

function isIteratorConfig(value: unknown): value is IteratorConfig {
  if (!isRecord(value)) return false;
  return typeof value.listVariable === "undefined" || typeof value.listVariable === "string";
}

function parseJsonValue(value: string): unknown {
  return JSON.parse(value) as unknown;
}

export function createWorkflowRuntimeContext(args: {
  nodeData: WorkflowNodeData | undefined;
  stepInput: string | undefined;
  executionState: string | undefined;
}): WorkflowRuntimeContext {
  const currentNodeData = args.nodeData ?? {};
  const inputPayload = args.stepInput || args.executionState || "{}";
  const globalStatePayload = parseWorkflowState(inputPayload);
  let resolvedInput = inputPayload;

  if (currentNodeData._inputMapping) {
    resolvedInput = JSON.stringify(resolveTemplate(currentNodeData._inputMapping, globalStatePayload));
  } else if (typeof currentNodeData._inputTemplate === "string") {
    resolvedInput = resolveTemplate(currentNodeData._inputTemplate, globalStatePayload);
  }

  return {
    globalStatePayload,
    resolvedInput,
    currentNodeData,
  };
}

export function parseRuntimeJson(value: string, fallback: unknown = value) {
  try {
    return parseJsonValue(value);
  } catch {
    return fallback;
  }
}

export function getLogicConfig(nodeData: WorkflowNodeData): LogicConfig {
  const config = nodeData._logicConfig ?? { rules: [], fallbackBranch: "default" };
  if (!isLogicConfig(config)) {
    throw new Error("Logic node config must include an optional fallbackBranch and rules array.");
  }
  return config;
}

export function getWaitConfig(nodeData: WorkflowNodeData): WaitConfig {
  const config = nodeData._waitConfig ?? { delaySeconds: 5 };
  if (!isWaitConfig(config)) {
    throw new Error("Wait node config must include a numeric or string delaySeconds value.");
  }
  return config;
}

export function getApprovalConfig(nodeData: WorkflowNodeData): ApprovalConfig {
  const config = nodeData._approvalConfig ?? { message: "Action requires manual sign-off" };
  if (!isApprovalConfig(config)) {
    throw new Error("Approval node config must include optional string message and previewTarget values.");
  }
  return config;
}

export function getIteratorConfig(nodeData: WorkflowNodeData): IteratorConfig {
  const config = nodeData._iteratorConfig ?? {};
  if (!isIteratorConfig(config)) {
    throw new Error("Iterator node config must include an optional string listVariable value.");
  }
  return config;
}

export function evaluateLogicBranch(config: LogicConfig, globalStatePayload: Record<string, unknown>) {
  let evaluatedBranch = config.fallbackBranch;

  for (const rule of config.rules ?? []) {
    const resolvedVar = resolveTemplate(rule.variable, globalStatePayload);
    const resolvedVal = rule.value ? resolveTemplate(rule.value, globalStatePayload) : rule.value;

    let match = false;
    switch (rule.operator) {
      case "EQUALS":
        match = String(resolvedVar) === String(resolvedVal);
        break;
      case "NOT_EQUALS":
        match = String(resolvedVar) !== String(resolvedVal);
        break;
      case "CONTAINS":
        match = String(resolvedVar).includes(String(resolvedVal));
        break;
      case "GREATER_THAN":
        match = parseFloat(String(resolvedVar)) > parseFloat(String(resolvedVal ?? ""));
        break;
      case "LESS_THAN":
        match = parseFloat(String(resolvedVar)) < parseFloat(String(resolvedVal ?? ""));
        break;
      case "IS_EMPTY":
        match = !resolvedVar || String(resolvedVar).trim() === "";
        break;
      case "NOT_EMPTY":
        match = !!resolvedVar && String(resolvedVar).trim() !== "";
        break;
    }

    if (match) {
      evaluatedBranch = rule.branch;
      break;
    }
  }

  return evaluatedBranch;
}

export function executeLogicNode(nodeData: WorkflowNodeData, globalStatePayload: WorkflowStatePayload) {
  const config = getLogicConfig(nodeData);
  const evaluatedBranch = evaluateLogicBranch(config, globalStatePayload);
  return JSON.stringify({ evaluated: evaluatedBranch });
}

export function executeWaitNode(nodeData: WorkflowNodeData, globalStatePayload: WorkflowStatePayload) {
  const config = getWaitConfig(nodeData);
  const resolvedDelay = resolveTemplate(String(config.delaySeconds), globalStatePayload);
  let delayMs = parseInt(resolvedDelay, 10) * 1000;
  if (isNaN(delayMs) || delayMs < 0) delayMs = 0;

  return JSON.stringify({
    _system: { delayMs, structurallyHandled: true },
    waitedSeconds: delayMs / 1000,
  });
}

export function executeApprovalNode(nodeData: WorkflowNodeData, globalStatePayload: WorkflowStatePayload) {
  const config = getApprovalConfig(nodeData);
  const previewValue = config.previewTarget ? resolveTemplate(config.previewTarget, globalStatePayload) : null;

  return JSON.stringify({
    _system: { halt: true, structurallyHandled: true },
    message: config.message,
    previewData: previewValue,
  });
}

export function executeIteratorNode(nodeData: WorkflowNodeData, globalStatePayload: WorkflowStatePayload) {
  const config = getIteratorConfig(nodeData);
  const resolvedArray = resolveTemplate(config.listVariable || "", globalStatePayload);
  let parsedArray = typeof resolvedArray === "string" ? parseRuntimeJson(resolvedArray, resolvedArray) : resolvedArray;
  if (!Array.isArray(parsedArray)) parsedArray = [parsedArray];

  return JSON.stringify({
    _system: { isIterator: true },
    items: parsedArray,
  });
}

export function buildMergeNodeOutput(args: {
  nodeId: string;
  executionSteps: MergeStepInput[];
  edges: WorkflowEdge[];
}) {
  const incomingEdges = args.edges.filter((edge) => edge.target === args.nodeId);
  const mergedPayload: Record<string, WorkflowNodeOutput | WorkflowNodeOutput[]> = {};

  for (const edge of incomingEdges) {
    const upstreamSteps = args.executionSteps.filter((step) => step.nodeId === edge.source && step.status === "SUCCESS");

    if (upstreamSteps.length > 1) {
      mergedPayload[edge.source] = upstreamSteps.map((step) => parseWorkflowOutput(step.output));
    } else if (upstreamSteps.length === 1) {
      mergedPayload[edge.source] = parseWorkflowOutput(upstreamSteps[0].output);
    }
  }

  return JSON.stringify({
    _system: { isMerge: true, structurallyHandled: true },
    mergedContexts: mergedPayload,
  });
}

export function executeBypassNode(args: { nodeType: string | undefined; resolvedInput: string }) {
  return JSON.stringify({ bypassed: true, nodeType: args.nodeType, received: args.resolvedInput });
}

export function sanitizeForConvexValue(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sanitizeForConvexValue);

  if (obj !== null && typeof obj === "object") {
    const clean: Record<string, unknown> = {};
    for (const key in obj as Record<string, unknown>) {
      const safeKey = key.startsWith("$") ? key.substring(1) : key;
      clean[safeKey] = sanitizeForConvexValue((obj as Record<string, unknown>)[key]);
    }
    return clean;
  }

  return obj;
}

export function getWorkflowSystemCommands(outputPayload: string) {
  let delayMs = 0;
  let halt = false;

  const output = parseWorkflowOutput(outputPayload);
  if (output._system && typeof output._system === "object") {
    if (typeof output._system.delayMs === "number" && Number.isFinite(output._system.delayMs)) {
      delayMs = output._system.delayMs;
    }
    if (output._system.halt === true) halt = true;
  }

  return { delayMs, halt };
}
