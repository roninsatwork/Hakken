type JsonSchema = Record<string, unknown>;

export type ToolAccessRole = "ADMIN" | "SUPER_ADMIN";
export type ToolExecutorRole = "USER" | "ADMIN" | "SUPER_ADMIN";

export type ToolDefinitionInput = {
  name: string;
  description: string;
  handlerMapping: string;
  requiredRole: ToolAccessRole;
  inputSchema?: unknown;
};

export type ProviderToolDeclaration = {
  name: string;
  description: string;
  parametersJsonSchema?: JsonSchema;
};

export type ToolCallPayload = {
  name: string;
  args: Record<string, unknown>;
};

export type ToolAccessDecision = {
  allowed: boolean;
  reason?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Unknown tool execution error.";
}

export function normalizeToolFunctionName(value: string) {
  const normalized = value.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^([^a-zA-Z_])/, "_$1");
  return normalized.length > 0 ? normalized : "tool";
}

export function parseToolInputSchema(value: unknown): JsonSchema | undefined {
  if (typeof value === "undefined" || value === null || value === "") return undefined;

  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
  if (!isRecord(parsed)) {
    throw new Error("Tool input schema must be a JSON object.");
  }

  return parsed;
}

export function buildProviderToolDeclaration(tool: ToolDefinitionInput): ProviderToolDeclaration {
  return {
    name: normalizeToolFunctionName(tool.handlerMapping),
    description: tool.description,
    parametersJsonSchema: parseToolInputSchema(tool.inputSchema),
  };
}

export function parseToolCallPayload(args: { name?: unknown; callArgs?: unknown }): ToolCallPayload {
  if (typeof args.name !== "string" || args.name.trim().length === 0) {
    throw new Error("Tool call payload must include a non-empty string name.");
  }

  if (typeof args.callArgs === "undefined" || args.callArgs === null) {
    return { name: normalizeToolFunctionName(args.name), args: {} };
  }

  if (!isRecord(args.callArgs)) {
    throw new Error("Tool call payload args must be a JSON object.");
  }

  return {
    name: normalizeToolFunctionName(args.name),
    args: args.callArgs,
  };
}

export function buildToolResultPayload(args: { status: "success" | "error"; data?: unknown; error?: string }) {
  if (args.status === "error") {
    return {
      status: "error",
      error: args.error || "Tool execution failed.",
    };
  }

  return {
    status: "success",
    data: args.data ?? null,
  };
}

export function buildToolFailureResult(error: unknown) {
  return buildToolResultPayload({
    status: "error",
    error: getErrorMessage(error),
  });
}

export function canExecuteTool(args: {
  requiredRole: ToolAccessRole;
  userRole?: ToolExecutorRole;
  userCompanyId?: string;
  targetCompanyId?: string;
}): ToolAccessDecision {
  if (!args.userRole) {
    return { allowed: false, reason: "Tool execution requires an authenticated user." };
  }

  if (args.userRole === "USER") {
    return { allowed: false, reason: "Tool execution requires administrator privileges." };
  }

  if (args.requiredRole === "SUPER_ADMIN" && args.userRole !== "SUPER_ADMIN") {
    return { allowed: false, reason: "Tool execution requires super-admin privileges." };
  }

  if (args.userRole === "SUPER_ADMIN") {
    return { allowed: true };
  }

  if (args.targetCompanyId && (!args.userCompanyId || args.userCompanyId !== args.targetCompanyId)) {
    return { allowed: false, reason: "Tool execution is not allowed across tenant boundaries." };
  }

  return { allowed: true };
}

export function assertCanExecuteTool(args: Parameters<typeof canExecuteTool>[0]) {
  const decision = canExecuteTool(args);
  if (!decision.allowed) {
    throw new Error(decision.reason || "Tool execution denied.");
  }
}

export function normalizeAiRuntimeError(error: unknown, fallback = "AI runtime request failed.") {
  const message = getErrorMessage(error);

  return {
    ok: false,
    error: message === "Unknown tool execution error." ? fallback : message,
  };
}
