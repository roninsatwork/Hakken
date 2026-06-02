import { describe, expect, test } from "vitest";
import type { Doc, Id } from "./_generated/dataModel";
import {
  buildAgentUpdatePatch,
  buildCreateAgentAuditMetadata,
  buildCreateInlineAgentAuditMetadata,
  buildDeleteAgentAuditMetadata,
  buildGlobalAgentRecord,
  buildInlineAgentRecord,
  buildPromoteAgentAuditMetadata,
  buildPromoteAgentPatch,
  buildUpdateAgentAuditMetadata,
  isGlobalAgent,
} from "./agentService";

const baseAgent = {
  _id: "agent-1" as Id<"agents">,
  _creationTime: 0,
  name: "Agent",
  modelId: "model-1",
  thinkingMode: false,
  isActive: true,
  temperature: 1,
  humanApprovalRequired: false,
  createdAt: 1,
  updatedAt: 1,
} satisfies Doc<"agents">;

describe("agent service helpers", () => {
  test("identifies global agents using the existing default semantics", () => {
    expect(isGlobalAgent(baseAgent)).toBe(true);
    expect(isGlobalAgent({ ...baseAgent, isGlobal: true })).toBe(true);
    expect(isGlobalAgent({ ...baseAgent, isGlobal: false })).toBe(false);
  });

  test("builds global agent records", () => {
    expect(
      buildGlobalAgentRecord({ name: "Support", description: "Helps users", modelId: "model-1" }, 123)
    ).toEqual({
      name: "Support",
      description: "Helps users",
      modelId: "model-1",
      thinkingMode: false,
      isActive: true,
      isGlobal: true,
      temperature: 1.0,
      humanApprovalRequired: false,
      createdAt: 123,
      updatedAt: 123,
    });
  });

  test("builds inline workflow agent records", () => {
    const workflowId = "workflow-1" as Id<"workflows">;

    expect(buildInlineAgentRecord({ workflowId, modelId: "model-1" }, 123)).toEqual({
      name: "Sandbox Agent",
      description: "Inline agent logic",
      modelId: "model-1",
      thinkingMode: false,
      isActive: true,
      temperature: 1.0,
      humanApprovalRequired: false,
      isGlobal: false,
      workflowId,
      createdAt: 123,
      updatedAt: 123,
    });
  });

  test("builds update and promote patches", () => {
    expect(
      buildAgentUpdatePatch({
        updates: { name: "Updated" },
        resolvedAvatarUrl: "https://cdn.example/avatar.png",
        now: 123,
      })
    ).toEqual({
      name: "Updated",
      avatar: "https://cdn.example/avatar.png",
      updatedAt: 123,
    });

    expect(buildPromoteAgentPatch(123)).toEqual({
      isGlobal: true,
      workflowId: undefined,
      updatedAt: 123,
    });
  });

  test("serializes agent audit metadata", () => {
    const workflowId = "workflow-1" as Id<"workflows">;

    expect(buildCreateAgentAuditMetadata("Support")).toBe(JSON.stringify({ name: "Support", scope: "global" }));
    expect(buildUpdateAgentAuditMetadata(["name", "modelId"])).toBe(
      JSON.stringify({ updatedFields: ["name", "modelId"] })
    );
    expect(buildDeleteAgentAuditMetadata("Support")).toBe(JSON.stringify({ name: "Support" }));
    expect(buildCreateInlineAgentAuditMetadata(workflowId)).toBe(
      JSON.stringify({ scope: "inline_workflow", workflowId })
    );
    expect(buildPromoteAgentAuditMetadata()).toBe(JSON.stringify({ action: "promoted_to_global" }));
  });
});
