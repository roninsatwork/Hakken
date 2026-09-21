import { describe, expect, test } from "vitest";
import {
  canGenerateText,
  canProviderServeUseCase,
  DECISION_MODEL_USE_CASE,
  DEFAULT_MODEL_USE_CASES,
  describeUseCaseProviderLimit,
  getDefaultModelId,
  getExecutionModelPool,
  resolveExecutionModel,
  SYSTEM_FAILSAFE_MODEL_ID,
  TYPESAFE_PROVIDER_KEY,
} from "./aiModelService";

const model = (modelId: string, isEnabled: boolean, isDefault = false, providerKey?: string, providerModelId?: string) => ({
  modelId,
  isEnabled,
  isDefault,
  providerKey,
  providerModelId,
});

describe("aiModelService", () => {
  test("uses the active default model when one is configured", () => {
    expect(getDefaultModelId([
      model("disabled-default", false, true),
      model("active-default", true, true),
    ])).toBe("active-default");
  });

  test("prefers any enabled model over the compiled-in identifier", () => {
    // The catalogue is the source of truth for what this deployment can call.
    // Reaching past it to a compiled-in ID means running a model nobody
    // configured — and one pinned to whatever generation was current when the
    // constant was written, which fails as an opaque provider 404 rather than
    // as "no model configured".
    expect(getDefaultModelId([
      model("disabled-default", false, true),
      model("active-secondary", true, false),
    ])).toBe("active-secondary");
  });

  test("uses the compiled-in identifier only when nothing is enabled at all", () => {
    expect(getDefaultModelId([
      model("disabled-a", false, true),
      model("disabled-b", false, false),
    ])).toBe(SYSTEM_FAILSAFE_MODEL_ID);
  });

  test("returns only enabled models for execution pools", () => {
    expect(getExecutionModelPool([
      model("enabled-a", true),
      model("disabled-b", false),
      model("enabled-c", true),
    ])).toEqual(["enabled-a", "enabled-c"]);
  });

  test("uses the failsafe as the execution pool when no enabled models exist", () => {
    expect(getExecutionModelPool([
      model("disabled-a", false),
      model("disabled-b", false),
    ])).toEqual([SYSTEM_FAILSAFE_MODEL_ID]);
  });

  test("resolves requested execution model when enabled", () => {
    expect(
      resolveExecutionModel({
        requestedModelId: "openai:gpt-test",
        requestedModel: model("openai:gpt-test", true, false, "openai", "gpt-test"),
        defaultModels: [model("default", true, true)],
      })
    ).toEqual({
      modelId: "openai:gpt-test",
      providerKey: "openai",
      providerModelId: "gpt-test",
      source: "requested",
    });
  });

  test("falls back to active default when requested execution model is disabled", () => {
    expect(
      resolveExecutionModel({
        requestedModelId: "requested",
        requestedModel: model("requested", false),
        defaultModels: [model("default", true, true)],
      })
    ).toEqual({
      modelId: "default",
      providerKey: "google",
      providerModelId: "default",
      source: "default",
    });
  });

  test("falls back to platform failsafe when requested and default models are unavailable", () => {
    expect(
      resolveExecutionModel({
        requestedModelId: "missing",
        requestedModel: null,
        defaultModels: [model("disabled-default", false, true)],
      })
    ).toEqual({
      modelId: SYSTEM_FAILSAFE_MODEL_ID,
      providerKey: "google",
      providerModelId: SYSTEM_FAILSAFE_MODEL_ID,
      source: "failsafe",
    });
  });
});

/**
 * TypeSafe is a judgment provider. It must be the only provider the Decisions
 * job accepts, and the Decisions job must be the only one it accepts — a
 * judgment model routed to a text job throws at the first call, and a chat
 * model routed to Decisions cannot return a probability.
 */
describe("decisions job and the TypeSafe provider", () => {
  test("any provider can serve the decisions job, TypeSafe included (no dependency on TypeSafe)", () => {
    expect(canProviderServeUseCase(TYPESAFE_PROVIDER_KEY, DECISION_MODEL_USE_CASE)).toBe(true);
    for (const provider of ["google", "openai", "anthropic", "openrouter", undefined]) {
      expect(canProviderServeUseCase(provider, DECISION_MODEL_USE_CASE)).toBe(true);
    }
  });

  test("TypeSafe can serve nothing but the decisions job", () => {
    for (const useCase of DEFAULT_MODEL_USE_CASES) {
      if (useCase === DECISION_MODEL_USE_CASE) continue;
      expect(canProviderServeUseCase(TYPESAFE_PROVIDER_KEY, useCase)).toBe(false);
    }
  });

  test("the decisions job explains the difference between a measured and an estimated certainty", () => {
    expect(describeUseCaseProviderLimit(DECISION_MODEL_USE_CASE)).toMatch(/Any model can do this job/);
  });

  test("a judgment model is never picked to write text", () => {
    expect(canGenerateText({ capabilities: [DECISION_MODEL_USE_CASE], supportedUseCases: [DECISION_MODEL_USE_CASE] })).toBe(false);
  });
});
