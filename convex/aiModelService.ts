import type { Doc } from "./_generated/dataModel";

export const SYSTEM_FAILSAFE_MODEL_ID = "gemini-2.5-flash";

type AiModelSelection = Pick<Doc<"aiModels">, "modelId" | "isDefault" | "isEnabled">;

export type ExecutionModelResolution = {
  modelId: string;
  source: "requested" | "default" | "failsafe";
};

export function getActiveDefaultModel(models: AiModelSelection[]) {
  return models.find((model) => model.isDefault && model.isEnabled);
}

export function getDefaultModelId(models: AiModelSelection[]) {
  return getActiveDefaultModel(models)?.modelId ?? SYSTEM_FAILSAFE_MODEL_ID;
}

export function resolveExecutionModel(args: {
  requestedModelId?: string;
  requestedModel?: AiModelSelection | null;
  defaultModels: AiModelSelection[];
}): ExecutionModelResolution {
  if (args.requestedModelId && args.requestedModel?.isEnabled) {
    return {
      modelId: args.requestedModel.modelId,
      source: "requested",
    };
  }

  const defaultModel = getActiveDefaultModel(args.defaultModels);
  if (defaultModel) {
    return {
      modelId: defaultModel.modelId,
      source: "default",
    };
  }

  return {
    modelId: SYSTEM_FAILSAFE_MODEL_ID,
    source: "failsafe",
  };
}

export function getExecutionModelPool(models: AiModelSelection[]) {
  const enabledModelIds = models
    .filter((model) => model.isEnabled)
    .map((model) => model.modelId);

  return enabledModelIds.length > 0 ? enabledModelIds : [SYSTEM_FAILSAFE_MODEL_ID];
}
