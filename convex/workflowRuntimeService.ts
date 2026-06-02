import { resolveTemplate } from "./utils/templateParser";
import { validateSafeUrl } from "./utils/security";
import {
  parseWorkflowOutput,
  parseWorkflowState,
  type WorkflowEdge,
  type WorkflowNodeData,
  type WorkflowNodeOutput,
  type WorkflowStatePayload,
} from "./utils/workflowTypes";

export type HeaderConfig = {
  key?: string;
  value?: string;
};

export type ActionConfig = {
  method?: string;
  url?: string;
  headers?: HeaderConfig[];
  body?: unknown;
};

export type DatabaseOperation = "INSERT" | "UPDATE" | "DELETE" | "SELECT";

export type DatabaseQueryFilter = {
  field?: string;
  value?: unknown;
};

export type DatabaseQueryConfig = {
  indexName?: string;
  equals?: DatabaseQueryFilter[];
  order?: "asc" | "desc";
  limit?: number | string;
};

export type DatabaseConfig = {
  tableName?: string;
  operation?: DatabaseOperation;
  docId?: string;
  query?: DatabaseQueryConfig;
};

export type EmailConfig = {
  to?: string;
  from?: string;
  subject?: string;
  body?: string;
};

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

export type ActionRequest = {
  url: string;
  fetchOptions: RequestInit;
};

export type DatabaseOperationInput = {
  tableName: string;
  operation: DatabaseOperation;
  docId?: string;
  query?: {
    indexName: string;
    equals: Array<{ field: string; value: unknown }>;
    order: "asc" | "desc";
    limit: number;
  };
  data: unknown;
};

export type EmailMessage = {
  fromAddress: string;
  toAddresses: string[] | string;
  subject: string;
  body: string;
};

export type EmailDeliveryOutputInput = {
  dispatchId?: unknown;
  toAddresses: string[] | string;
  subject: string;
};

export type WorkflowScheduleDecision = {
  halt: boolean;
  schedules: Array<{
    nodeId: string;
    delayMs: number;
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isHeaderConfig(value: unknown): value is HeaderConfig {
  if (!isRecord(value)) return false;
  return (
    (typeof value.key === "undefined" || typeof value.key === "string") &&
    (typeof value.value === "undefined" || typeof value.value === "string")
  );
}

function isActionConfig(value: unknown): value is ActionConfig {
  if (!isRecord(value)) return false;
  if (typeof value.method !== "undefined" && typeof value.method !== "string") return false;
  if (typeof value.url !== "undefined" && typeof value.url !== "string") return false;
  if (typeof value.headers !== "undefined" && (!Array.isArray(value.headers) || !value.headers.every(isHeaderConfig))) {
    return false;
  }
  return true;
}

const DATABASE_OPERATIONS = new Set(["INSERT", "UPDATE", "DELETE", "SELECT"]);

function isDatabaseConfig(value: unknown): value is DatabaseConfig {
  if (!isRecord(value)) return false;
  if (typeof value.tableName !== "undefined" && typeof value.tableName !== "string") return false;
  if (
    typeof value.operation !== "undefined" &&
    (typeof value.operation !== "string" || !DATABASE_OPERATIONS.has(value.operation))
  ) {
    return false;
  }
  if (typeof value.docId !== "undefined" && typeof value.docId !== "string") return false;
  if (typeof value.query !== "undefined" && !isDatabaseQueryConfig(value.query)) return false;
  return true;
}

function isDatabaseQueryFilter(value: unknown): value is DatabaseQueryFilter {
  if (!isRecord(value)) return false;
  return typeof value.field === "undefined" || typeof value.field === "string";
}

function isDatabaseQueryConfig(value: unknown): value is DatabaseQueryConfig {
  if (!isRecord(value)) return false;
  if (typeof value.indexName !== "undefined" && typeof value.indexName !== "string") return false;
  if (
    typeof value.equals !== "undefined" &&
    (!Array.isArray(value.equals) || !value.equals.every(isDatabaseQueryFilter))
  ) {
    return false;
  }
  if (typeof value.order !== "undefined" && value.order !== "asc" && value.order !== "desc") return false;
  if (
    typeof value.limit !== "undefined" &&
    typeof value.limit !== "number" &&
    typeof value.limit !== "string"
  ) {
    return false;
  }
  return true;
}

function isEmailConfig(value: unknown): value is EmailConfig {
  if (!isRecord(value)) return false;
  return (
    (typeof value.to === "undefined" || typeof value.to === "string") &&
    (typeof value.from === "undefined" || typeof value.from === "string") &&
    (typeof value.subject === "undefined" || typeof value.subject === "string") &&
    (typeof value.body === "undefined" || typeof value.body === "string")
  );
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

export function getRuntimeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
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

export function getActionConfig(nodeData: WorkflowNodeData): ActionConfig {
  const config = nodeData._actionConfig;
  if (typeof config === "undefined") {
    throw new Error("API Node is missing configuration");
  }
  if (!isActionConfig(config)) {
    throw new Error("API node config must include optional string method/url values and valid headers.");
  }
  return config;
}

export function getDatabaseConfig(nodeData: WorkflowNodeData): DatabaseConfig {
  const config = nodeData._dbConfig;
  if (typeof config === "undefined") {
    throw new Error("Database Node is missing configuration");
  }
  if (!isDatabaseConfig(config)) {
    throw new Error("Database node config must include a valid operation, optional tableName, optional docId, and optional indexed query.");
  }
  return config;
}

export function getEmailConfig(nodeData: WorkflowNodeData): EmailConfig {
  const config = nodeData._emailConfig ?? {};
  if (!isEmailConfig(config)) {
    throw new Error("Email node config must include optional string to/from/subject/body values.");
  }
  return config;
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

export function buildActionRequest(nodeData: WorkflowNodeData, globalStatePayload: WorkflowStatePayload): ActionRequest {
  const config = resolveTemplate(getActionConfig(nodeData), globalStatePayload);
  const method = config.method || "GET";
  const url = config.url;
  if (!url) throw new Error("Missing URL for Action Node");

  validateSafeUrl(url, "Action Node");

  const headers: Record<string, string> = {};
  for (const header of config.headers ?? []) {
    if (header.key) headers[header.key] = header.value ?? "";
  }

  const fetchOptions: RequestInit = { method, headers };
  const body = config.body;
  if (method !== "GET" && method !== "HEAD" && body) {
    fetchOptions.body = typeof body === "object" ? JSON.stringify(body) : String(body);
  }

  return { url, fetchOptions };
}

export function buildActionResponseOutput(status: number, responseText: string) {
  return JSON.stringify({
    status,
    data: parseRuntimeJson(responseText, responseText),
  });
}

export function buildCodeNodeOutput(args: {
  nodeData: WorkflowNodeData;
  resolvedInput: string;
  executionState: string | undefined;
}) {
  const parsedInput = parseRuntimeJson(args.resolvedInput);
  let output: unknown = parsedInput;

  if (typeof args.nodeData._inputTemplate === "string") {
    const safeGlobalPayload = {
      input: parsedInput,
      execution: parseRuntimeJson(args.executionState || "{}", {}),
    };
    output = resolveTemplate(args.nodeData._inputTemplate, safeGlobalPayload);
  }

  return JSON.stringify(output);
}

export function buildDatabaseOperationInput(
  nodeData: WorkflowNodeData,
  globalStatePayload: WorkflowStatePayload
): DatabaseOperationInput {
  const config = getDatabaseConfig(nodeData);
  const { tableName, operation, docId, query } = config;
  if (!tableName) throw new Error("Database table not specified");
  if (!operation) throw new Error("Database operation not specified");

  const resolvedDocId = docId ? resolveTemplate(docId, globalStatePayload) : undefined;
  const resolvedQuery = query ? buildDatabaseQueryInput(query, globalStatePayload) : undefined;

  if (operation === "SELECT" && !resolvedDocId && !resolvedQuery) {
    throw new Error("Database SELECT requires a target document ID or an indexed query contract.");
  }

  let resolvedData: unknown = {};
  if (isRecord(nodeData._inputMapping) && Object.keys(nodeData._inputMapping).length > 0) {
    resolvedData = resolveTemplate(nodeData._inputMapping, globalStatePayload);
  } else if (typeof nodeData._inputTemplate === "string") {
    resolvedData = parseRuntimeJson(resolveTemplate(nodeData._inputTemplate, globalStatePayload), {});
  }

  return {
    tableName,
    operation,
    docId: resolvedDocId,
    ...(resolvedQuery ? { query: resolvedQuery } : {}),
    data: sanitizeForConvexValue(resolvedData),
  };
}

function buildDatabaseQueryInput(query: DatabaseQueryConfig, globalStatePayload: WorkflowStatePayload) {
  const indexName = query.indexName?.trim();
  if (!indexName) throw new Error("Database SELECT query requires an indexName.");

  const limit = Number(resolveTemplate(String(query.limit ?? 15), globalStatePayload));
  if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
    throw new Error("Database SELECT query limit must be between 1 and 100.");
  }

  const equals = (query.equals ?? [])
    .map((filter) => {
      const field = filter.field?.trim();
      if (!field) throw new Error("Database SELECT query filters require a field.");
      const value =
        typeof filter.value === "string"
          ? resolveTemplate(filter.value, globalStatePayload)
          : resolveTemplate(filter.value, globalStatePayload);
      return { field, value: sanitizeForConvexValue(value) };
    });

  return {
    indexName,
    equals,
    order: query.order ?? "desc",
    limit: Math.floor(limit),
  };
}

export function buildEmailMessage(args: {
  nodeData: WorkflowNodeData;
  globalStatePayload: WorkflowStatePayload;
  defaultFromAddress: string;
}): EmailMessage {
  const config = getEmailConfig(args.nodeData);
  const resolvedToRaw = resolveTemplate(config.to || "", args.globalStatePayload);
  const resolvedFrom = resolveTemplate(config.from || "", args.globalStatePayload);
  const subject = resolveTemplate(config.subject || "No Subject", args.globalStatePayload);
  const body = resolveTemplate(config.body || "", args.globalStatePayload);
  const fromAddress = resolvedFrom.trim() !== "" ? resolvedFrom : args.defaultFromAddress;

  let toAddresses: string[] | string = resolvedToRaw;
  if (resolvedToRaw.includes(",")) {
    toAddresses = resolvedToRaw
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);
  }

  return { fromAddress, toAddresses, subject, body };
}

export function buildDatabaseNodeOutput(args: { operation: DatabaseOperation; tableName: string; result: unknown }) {
  return JSON.stringify({
    _system: { db: true },
    operation: args.operation,
    tableName: args.tableName,
    result: args.result,
  });
}

export function buildEmailSimulationOutput(args: { toAddresses: string[] | string; subject: string; body: string }) {
  return JSON.stringify({
    success: true,
    simulated: true,
    to: args.toAddresses,
    subject: args.subject,
    bodyPreview: args.body.substring(0, 100),
  });
}

export function buildEmailDeliveryOutput(args: EmailDeliveryOutputInput) {
  return JSON.stringify({
    success: true,
    dispatchId: isRecord(args.dispatchId) ? args.dispatchId.id : undefined,
    to: args.toAddresses,
    subject: args.subject,
  });
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

export function buildWorkflowScheduleDecision(outputPayload: string, downstreamNodeIds: string[]): WorkflowScheduleDecision {
  const { delayMs, halt } = getWorkflowSystemCommands(outputPayload);
  return {
    halt,
    schedules: halt ? [] : downstreamNodeIds.map((nodeId) => ({ nodeId, delayMs })),
  };
}
