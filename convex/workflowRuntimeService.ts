import { resolveTemplate } from "./utils/templateParser";

export type LogicConfig = {
  fallbackBranch?: string;
  rules?: Array<{
    variable: string;
    value?: string;
    operator: "EQUALS" | "NOT_EQUALS" | "CONTAINS" | "GREATER_THAN" | "LESS_THAN" | "IS_EMPTY" | "NOT_EMPTY";
    branch: string;
  }>;
};

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

  try {
    const outObj = JSON.parse(outputPayload);
    if (outObj._system?.delayMs) delayMs = outObj._system.delayMs;
    if (outObj._system?.halt) halt = true;
  } catch {
    // Non-JSON outputs do not carry structural workflow commands.
  }

  return { delayMs, halt };
}
