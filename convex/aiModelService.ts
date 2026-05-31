import type { Doc } from "./_generated/dataModel";

export const SYSTEM_FAILSAFE_MODEL_ID = "gemini-2.5-flash";

type AiModelSelection = Pick<Doc<"aiModels">, "modelId" | "isDefault" | "isEnabled">;

export function getActiveDefaultModel(models: AiModelSelection[]) {
  return models.find((model) => model.isDefault && model.isEnabled);
}

export function getDefaultModelId(models: AiModelSelection[]) {
  return getActiveDefaultModel(models)?.modelId ?? SYSTEM_FAILSAFE_MODEL_ID;
}

export function getExecutionModelPool(models: AiModelSelection[]) {
  const enabledModelIds = models
    .filter((model) => model.isEnabled)
    .map((model) => model.modelId);

  return enabledModelIds.length > 0 ? enabledModelIds : [SYSTEM_FAILSAFE_MODEL_ID];
}
