"use client";

import { AlertTriangle } from "lucide-react";

type AiRuleSafetyWarning = {
  category: "hidden_instructions" | "permission_bypass" | "cross_tenant_access";
  message: string;
};

const HIDDEN_INSTRUCTION_PATTERN =
  /\b(?:reveal|show|print|display|dump|disclose|repeat|quote|summari[sz]e|transform|reconstruct)\b[\s\S]{0,120}\b(?:system prompt|developer message|developer instructions|hidden instructions|internal instructions|platform policy|tool schema|private configuration)\b/i;

const PERMISSION_BYPASS_PATTERN =
  /\b(?:ignore|bypass|override|disable|forget)\b[\s\S]{0,80}\b(?:previous instructions|prior instructions|system instructions|safety rules|tenant restrictions|permissions|authorization|role checks)\b/i;

const CROSS_TENANT_PATTERN =
  /\b(?:another|other|different)\s+(?:tenant|company|customer|client|organization|organisation)\b[\s\S]{0,120}\b(?:data|documents|files|messages|chat logs|users|analytics|secrets|knowledge)\b/i;

export function getAiRuleSafetyWarnings(input: string): AiRuleSafetyWarning[] {
  const warnings: AiRuleSafetyWarning[] = [];

  if (HIDDEN_INSTRUCTION_PATTERN.test(input)) {
    warnings.push({
      category: "hidden_instructions",
      message: "This rule appears to disclose hidden prompts, policies, schemas, or private configuration.",
    });
  }

  if (PERMISSION_BYPASS_PATTERN.test(input)) {
    warnings.push({
      category: "permission_bypass",
      message: "This rule appears to weaken safety rules, tenant restrictions, permissions, or authorization.",
    });
  }

  if (CROSS_TENANT_PATTERN.test(input)) {
    warnings.push({
      category: "cross_tenant_access",
      message: "This rule appears to permit access to another tenant's private data.",
    });
  }

  return warnings;
}

export function AiRuleSafetyWarningPanel({
  trigger,
  instruction,
  subject = "rule",
}: {
  trigger: string;
  instruction: string;
  subject?: "rule" | "prompt";
}) {
  const warnings = getAiRuleSafetyWarnings(`${trigger}\n${instruction}`);

  if (warnings.length === 0) return null;

  return (
    <div className="ml-1 rounded-[10px] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-700 dark:text-amber-300">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-semibold">Review this {subject} before saving.</p>
          <ul className="flex flex-col gap-1">
            {warnings.map((warning) => (
              <li key={warning.category} className="text-[12px] leading-relaxed text-amber-800/90 dark:text-amber-200/90">
                {warning.message}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
