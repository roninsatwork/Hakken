type JsonSchema = Record<string, unknown>;

export type ToolAccessRole = "ADMIN" | "SUPER_ADMIN";
export type ToolExecutorRole = "USER" | "ADMIN" | "SUPER_ADMIN";
export type ToolSideEffectLevel = "READ" | "WRITE" | "DESTRUCTIVE" | "EXTERNAL";
export type ToolHandlerExecutionInput = {
  handlerMapping: string;
  args: Record<string, unknown>;
};

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

export type ToolExecutionPolicyInput = {
  requiredRole: ToolAccessRole;
  sideEffectLevel?: ToolSideEffectLevel;
  confirmationRequired?: boolean;
};

export type NormalizedToolExecutionPolicy = {
  requiredRole: ToolAccessRole;
  sideEffectLevel: ToolSideEffectLevel;
  confirmationRequired: boolean;
};

export type ToolArgumentValidationResult = {
  ok: boolean;
  errors: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Unknown tool execution error.";
}

function getJsonSchemaType(value: unknown) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
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

export function validateToolJsonSchemaString(value: unknown, label = "Tool schema") {
  const parsed = parseToolInputSchema(value);
  if (!parsed) return undefined;

  if (parsed.type !== undefined && parsed.type !== "object") {
    throw new Error(`${label} must use root type "object".`);
  }

  if (parsed.properties !== undefined && !isRecord(parsed.properties)) {
    throw new Error(`${label} properties must be a JSON object.`);
  }

  if (parsed.required !== undefined) {
    if (!Array.isArray(parsed.required) || !parsed.required.every((entry) => typeof entry === "string")) {
      throw new Error(`${label} required must be an array of strings.`);
    }
  }

  return parsed;
}

export function validateToolCallArgsAgainstSchema(args: {
  schema?: unknown;
  callArgs: Record<string, unknown>;
}): ToolArgumentValidationResult {
  const schema = parseToolInputSchema(args.schema);
  if (!schema) return { ok: true, errors: [] };

  const errors: string[] = [];
  const required = Array.isArray(schema.required) ? schema.required.filter((entry) => typeof entry === "string") : [];

  for (const field of required) {
    if (!(field in args.callArgs)) {
      errors.push(`Missing required tool argument '${field}'.`);
    }
  }

  const properties = isRecord(schema.properties) ? schema.properties : {};
  for (const [field, propertySchema] of Object.entries(properties)) {
    if (!(field in args.callArgs) || !isRecord(propertySchema)) continue;

    const expectedType = propertySchema.type;
    if (typeof expectedType !== "string") continue;

    const actualType = getJsonSchemaType(args.callArgs[field]);
    if (expectedType === "integer") {
      if (actualType !== "number" || !Number.isInteger(args.callArgs[field])) {
        errors.push(`Tool argument '${field}' must be an integer.`);
      }
      continue;
    }

    if (actualType !== expectedType) {
      errors.push(`Tool argument '${field}' must be a ${expectedType}.`);
    }
  }

  return { ok: errors.length === 0, errors };
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

export function normalizeToolExecutionPolicy(tool: ToolExecutionPolicyInput): NormalizedToolExecutionPolicy {
  const sideEffectLevel = tool.sideEffectLevel ?? "READ";
  const confirmationRequired = sideEffectLevel === "READ"
    ? (tool.confirmationRequired ?? false)
    : true;

  return {
    requiredRole: tool.requiredRole,
    sideEffectLevel,
    confirmationRequired,
  };
}

export function canExecuteTool(args: {
  requiredRole: ToolAccessRole;
  userRole?: ToolExecutorRole;
  userCompanyId?: string;
  targetCompanyId?: string;
  sideEffectLevel?: ToolSideEffectLevel;
  confirmationRequired?: boolean;
  confirmationGranted?: boolean;
}): ToolAccessDecision {
  const policy = normalizeToolExecutionPolicy({
    requiredRole: args.requiredRole,
    sideEffectLevel: args.sideEffectLevel,
    confirmationRequired: args.confirmationRequired,
  });

  if (!args.userRole) {
    return { allowed: false, reason: "Tool execution requires an authenticated user." };
  }

  if (args.userRole === "USER") {
    return { allowed: false, reason: "Tool execution requires administrator privileges." };
  }

  if (policy.requiredRole === "SUPER_ADMIN" && args.userRole !== "SUPER_ADMIN") {
    return { allowed: false, reason: "Tool execution requires super-admin privileges." };
  }

  if (args.userRole === "SUPER_ADMIN") {
    if (policy.confirmationRequired && !args.confirmationGranted) {
      return { allowed: false, reason: "Tool execution requires explicit user confirmation." };
    }

    return { allowed: true };
  }

  if (args.targetCompanyId && (!args.userCompanyId || args.userCompanyId !== args.targetCompanyId)) {
    return { allowed: false, reason: "Tool execution is not allowed across tenant boundaries." };
  }

  if (policy.confirmationRequired && !args.confirmationGranted) {
    return { allowed: false, reason: "Tool execution requires explicit user confirmation." };
  }

  return { allowed: true };
}

export function assertCanExecuteTool(args: Parameters<typeof canExecuteTool>[0]) {
  const decision = canExecuteTool(args);
  if (!decision.allowed) {
    throw new Error(decision.reason || "Tool execution denied.");
  }
}

export function executeRegisteredTool(args: ToolHandlerExecutionInput) {
  void args;
  throw new Error("Unknown or unimplemented tool handler mapping.");
}

export function normalizeAiRuntimeError(error: unknown, fallback = "AI runtime request failed.") {
  const message = getErrorMessage(error);

  return {
    ok: false,
    error: message === "Unknown tool execution error." ? fallback : message,
  };
}
