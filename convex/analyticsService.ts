import type { Doc } from "./_generated/dataModel";
import { calculateModelCostGBP } from "./aiCostService";
import { getDefaultModelId } from "./aiModelService";

type DashboardTimeframe =
  | "today"
  | "yesterday"
  | "7d"
  | "14d"
  | "30d"
  | "60d"
  | "90d"
  | "180d"
  | "365d"
  | "ytd"
  | "custom";

export type AnalyticsAggregation = "day" | "week" | "month";
export type AiModelCostConfig = Pick<
  Doc<"aiModels">,
  | "modelId"
  | "providerKey"
  | "providerModelId"
  | "displayName"
  | "friendlyName"
  | "isDefault"
  | "isEnabled"
  | "standardInputCostBelow200k"
  | "standardInputCostAbove200k"
  | "outputResponseCost"
>;
export type ModelCostMap = Map<string, AiModelCostConfig>;

const dayMs = 24 * 60 * 60 * 1000;

export function resolveTimestampRange(args: {
  timeframe: DashboardTimeframe;
  customStart?: number;
  customEnd?: number;
}) {
  const now = Date.now();
  let start = 0;

  if (args.timeframe === "today") start = new Date().setHours(0, 0, 0, 0);
  else if (args.timeframe === "yesterday") start = new Date(now).setHours(0, 0, 0, 0) - dayMs;
  else if (args.timeframe === "7d") start = now - 7 * dayMs;
  else if (args.timeframe === "14d") start = now - 14 * dayMs;
  else if (args.timeframe === "30d") start = now - 30 * dayMs;
  else if (args.timeframe === "60d") start = now - 60 * dayMs;
  else if (args.timeframe === "90d") start = now - 90 * dayMs;
  else if (args.timeframe === "180d") start = now - 180 * dayMs;
  else if (args.timeframe === "365d") start = now - 365 * dayMs;
  else if (args.timeframe === "ytd") start = new Date(new Date().getFullYear(), 0, 1).getTime();
  else if (args.timeframe === "custom" && args.customStart) start = args.customStart;

  const end = args.timeframe === "custom" && args.customEnd ? args.customEnd : now;
  return { start, end };
}

export function resolveDateRange(args: {
  timeframe: DashboardTimeframe;
  customStart?: number;
  customEnd?: number;
}) {
  const now = new Date();
  let start = new Date();
  const end = new Date();

  if (args.timeframe === "today") {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (args.timeframe === "yesterday") {
    start.setDate(now.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(now.getDate() - 1);
    end.setHours(23, 59, 59, 999);
  } else if (args.timeframe === "7d") start.setDate(now.getDate() - 7);
  else if (args.timeframe === "14d") start.setDate(now.getDate() - 14);
  else if (args.timeframe === "30d") start.setDate(now.getDate() - 30);
  else if (args.timeframe === "60d") start.setDate(now.getDate() - 60);
  else if (args.timeframe === "90d") start.setDate(now.getDate() - 90);
  else if (args.timeframe === "180d") start.setDate(now.getDate() - 180);
  else if (args.timeframe === "365d") start.setDate(now.getDate() - 365);
  else if (args.timeframe === "ytd") start = new Date(now.getFullYear(), 0, 1);
  else if (args.timeframe === "custom" && args.customStart) start = new Date(args.customStart);

  if (args.timeframe === "custom" && args.customEnd) {
    end.setTime(args.customEnd);
  }

  return { now, start, end };
}

export function getAggregationType(start: number, end: number): AnalyticsAggregation {
  const durationDays = (end - start) / dayMs;
  return durationDays > 180 ? "month" : durationDays > 60 ? "week" : "day";
}

export function formatAnalyticsDateGroup(
  date: Date,
  aggregationType: AnalyticsAggregation,
  options: { includeWeekYear?: boolean } = {}
) {
  if (aggregationType === "month") {
    return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  }

  if (aggregationType === "week") {
    const target = new Date(date.valueOf());
    const dayNr = (date.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
      target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
    return `Wk ${weekNum}${options.includeWeekYear ? `, ${date.getFullYear()}` : ""}`;
  }

  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function createTimelineMap<T>(
  start: Date,
  end: Date,
  aggregationType: AnalyticsAggregation,
  createValue: () => T,
  options: { includeWeekYear?: boolean } = {}
) {
  const timelineMap: Record<string, T> = {};
  const currentDate = new Date(start.getTime());

  while (currentDate.getTime() <= end.getTime()) {
    const dateGroup = formatAnalyticsDateGroup(currentDate, aggregationType, options);
    if (!timelineMap[dateGroup]) timelineMap[dateGroup] = createValue();
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return timelineMap;
}

export function buildModelCostContext(aiModelsFetch: AiModelCostConfig[]) {
  const modelMap: ModelCostMap = new Map();
  for (const model of aiModelsFetch) {
    modelMap.set(model.modelId, model);
    if (model.providerModelId) {
      modelMap.set(model.providerModelId, model);
      if (model.providerKey) {
        modelMap.set(`${model.providerKey}:${model.providerModelId}`, model);
      }
    }
  }
  const defaultModelId = getDefaultModelId(aiModelsFetch);
  return { modelMap, defaultModelId };
}

/**
 * What a set of tokens cost, in **US dollars**.
 *
 * Every rate in the model catalogue is the provider's own published dollar
 * price — the synced records carry `currency: "USD"` — and nothing converts.
 * The callers of this used to multiply the result by a hardcoded 0.78 and print
 * a "£" in front of it, which was wrong twice over: the rate was a guess that
 * went stale the day it was written, and it disagreed with the model pricing
 * screen, which had already settled on showing dollars. Spend is reported in
 * the currency the provider bills in.
 *
 * The rates themselves are applied by `calculateModelCostGBP` rather than here.
 * This function used to carry its own copy of the tiering rule, and the copies
 * disagreed: the runtime learned to fall back to the standard rate when a model
 * has no separate above-200k price, and this one kept reading that missing price
 * as zero — as free. Every call over two hundred thousand tokens therefore cost
 * nothing on the analytics screens and in the daily snapshots, which is most of
 * what a long agent run is. One rule, in one place, is the only way those two
 * numbers stay the same number.
 */
export function computeCostFromMap(model: string, inputs: number, outputs: number, modelMap: ModelCostMap) {
  return calculateModelCostGBP({
    inputTokens: inputs,
    outputTokens: outputs,
    rates: modelMap.get(model),
  });
}


export function roundMetric(value: number, decimals: number) {
  return Number(value.toFixed(decimals));
}
