export type AssistantSafetyDecision =
  | { allowed: true }
  | { allowed: false; category: "hidden_instructions" | "permission_bypass" | "cross_tenant_access"; response: string };

export type AssistantSafetyWarning = {
  category: "hidden_instructions" | "permission_bypass" | "cross_tenant_access";
  severity: "high";
  message: string;
};

const HIDDEN_INSTRUCTION_PATTERN =
  /\b(?:reveal|show|print|display|dump|disclose|repeat|quote|summari[sz]e|transform|reconstruct)\b[\s\S]{0,120}\b(?:system prompt|developer message|developer instructions|hidden instructions|internal instructions|platform policy|tool schema|private configuration)\b/i;

const PERMISSION_BYPASS_PATTERN =
  /\b(?:ignore|bypass|override|disable|forget)\b[\s\S]{0,80}\b(?:previous instructions|prior instructions|system instructions|safety rules|tenant restrictions|permissions|authorization|role checks)\b/i;

const CROSS_TENANT_PATTERN =
  /\b(?:another|other|different)\s+(?:tenant|company|customer|client|organization|organisation)\b[\s\S]{0,120}\b(?:data|documents|files|messages|chat logs|users|analytics|secrets|knowledge)\b/i;

export function getAssistantSafetyWarnings(input: string): AssistantSafetyWarning[] {
  const warnings: AssistantSafetyWarning[] = [];

  if (HIDDEN_INSTRUCTION_PATTERN.test(input)) {
    warnings.push({
      category: "hidden_instructions",
      severity: "high",
      message: "Text appears to request or permit disclosure of hidden prompts, policies, schemas, or private configuration.",
    });
  }

  if (PERMISSION_BYPASS_PATTERN.test(input)) {
    warnings.push({
      category: "permission_bypass",
      severity: "high",
      message: "Text appears to request or permit bypassing safety rules, tenant restrictions, permissions, or authorization.",
    });
  }

  if (CROSS_TENANT_PATTERN.test(input)) {
    warnings.push({
      category: "cross_tenant_access",
      severity: "high",
      message: "Text appears to request or permit access to another tenant's private data.",
    });
  }

  return warnings;
}

export function evaluateAssistantSafety(input: string): AssistantSafetyDecision {
  const warningCategories = new Set(getAssistantSafetyWarnings(input).map((warning) => warning.category));

  if (warningCategories.has("hidden_instructions")) {
    return {
      allowed: false,
      category: "hidden_instructions",
      response:
        "I can't reveal hidden system instructions, platform policy, internal tool schemas, secrets, or private configuration. I can still explain Sonae's visible behavior or help with the task using information you are allowed to access.",
    };
  }

  if (warningCategories.has("permission_bypass")) {
    return {
      allowed: false,
      category: "permission_bypass",
      response:
        "I can't ignore or bypass Sonae's safety rules, tenant isolation, role permissions, or backend authorization. I can help with the request within the permissions available to this account.",
    };
  }

  if (warningCategories.has("cross_tenant_access")) {
    return {
      allowed: false,
      category: "cross_tenant_access",
      response:
        "I can't access or disclose another tenant's private data. I can help with information available in this tenant or suggest what an administrator should check.",
    };
  }

  return { allowed: true };
}
