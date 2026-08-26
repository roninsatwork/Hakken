import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import schema from "../schema";

/**
 * What the model catalogue and its default-picking screens hand back.
 *
 * `getProviders` is the one shape here whose `_id` is a plain string rather
 * than a document id, and deliberately: the list merges real `aiProviders`
 * rows with stand-ins for the platform providers that have no row yet, and a
 * stand-in has no id to give. Declaring it as an id would refuse the very rows
 * the merge exists to produce.
 */

const modelFields = schema.tables.aiModels.validator.fields;
const providerFields = schema.tables.aiProviders.validator.fields;
const defaultFields = schema.tables.aiModelDefaults.validator.fields;
const rollupFields = schema.tables.aiModelRollups.validator.fields;

const modelRowShape = v.object({
  ...modelFields,
  _id: v.id("aiModels"),
  _creationTime: v.number(),
});

export const modelListShape = v.array(modelRowShape);

export const modelPageShape = paginationResultValidator(modelRowShape);

export const modelOrNullShape = v.union(modelRowShape, v.null());

export const modelPickerOptionsShape = v.array(v.object({
  _id: v.id("aiModels"),
  modelId: modelFields.modelId,
  displayName: modelFields.displayName,
  providerKey: v.string(),
  supportedUseCases: v.array(v.string()),
  capabilities: v.array(v.string()),
  isEnabled: modelFields.isEnabled,
  standardInputCostBelow200k: modelFields.standardInputCostBelow200k,
  outputResponseCost: modelFields.outputResponseCost,
}));

export const modelCountsShape = v.object({
  totalModels: rollupFields.totalModels,
  enabledModels: rollupFields.enabledModels,
  byProvider: rollupFields.byProvider,
  computedAt: v.union(v.number(), v.null()),
  isPartial: rollupFields.isPartial,
});

export const providerListShape = v.array(v.object({
  _id: v.string(),
  _creationTime: v.number(),
  providerKey: providerFields.providerKey,
  displayName: providerFields.displayName,
  isEnabled: providerFields.isEnabled,
  authMode: providerFields.authMode,
  status: providerFields.status,
  lastHealthCheckAt: providerFields.lastHealthCheckAt,
  lastSyncedAt: providerFields.lastSyncedAt,
  syncStatus: providerFields.syncStatus,
  settings: providerFields.settings,
  createdAt: providerFields.createdAt,
  updatedAt: providerFields.updatedAt,
}));

export const providerDefaultUsageShape = v.object({
  globalUseCases: v.array(v.string()),
  companyCount: v.number(),
  isPartial: v.boolean(),
});

const defaultModelSummaryShape = v.union(v.null(), v.object({
  modelId: modelFields.modelId,
  providerKey: v.string(),
  providerModelId: v.string(),
  displayName: v.string(),
  isEnabled: modelFields.isEnabled,
}));

const modelDefaultShape = v.union(v.null(), v.object({
  _id: v.id("aiModelDefaults"),
  modelId: defaultFields.modelId,
  providerKey: defaultFields.providerKey,
  fallbackModelId: defaultFields.fallbackModelId,
  updatedAt: defaultFields.updatedAt,
  model: defaultModelSummaryShape,
}));

export const globalModelDefaultsShape = v.object({
  useCases: v.array(v.string()),
  defaults: v.array(v.object({
    useCase: v.string(),
    default: modelDefaultShape,
  })),
});

export const companyModelDefaultsShape = v.object({
  companyId: v.id("companies"),
  useCases: v.array(v.string()),
  defaults: v.array(v.object({
    useCase: v.string(),
    companyDefault: modelDefaultShape,
    globalDefault: modelDefaultShape,
  })),
  modelPickerOptions: v.array(v.object({
    modelId: modelFields.modelId,
    displayName: modelFields.displayName,
    providerKey: v.string(),
    supportedUseCases: v.array(v.string()),
    standardInputCostBelow200k: modelFields.standardInputCostBelow200k,
    outputResponseCost: modelFields.outputResponseCost,
  })),
  providerNames: v.array(v.object({
    providerKey: v.string(),
    displayName: v.string(),
  })),
});

export const setDefaultModelShape = v.object({
  appliedUseCases: v.number(),
  skippedUseCases: v.array(v.string()),
});
