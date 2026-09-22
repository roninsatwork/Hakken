import { Cpu, MessageSquare, PoundSterling, Users } from "lucide-react";
import type { AnalyticsAggregates, Translate } from "./types";
import { formatSmallUsdAmount } from "./costFormatters";
import { MetricBlock } from "./MetricBlock";

type AICostsMetricGridProps = {
  aggregates: AnalyticsAggregates;
  t: Translate;
};

export function AICostsMetricGrid({ aggregates, t }: AICostsMetricGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
      <MetricBlock
        className="md:col-span-2 lg:col-span-2 md:row-span-2 flex flex-col justify-center min-h-[220px]"
        largeText
        icon={PoundSterling}
        title={t("metrics.periodCost")}
        value={formatSmallUsdAmount(aggregates.totalCostUsd, 5)}
        sub={t("metrics.exchangeSub")}
        delay={0}
      />
      <MetricBlock
        icon={MessageSquare}
        title={t("metrics.avgCostConv")}
        value={formatSmallUsdAmount(aggregates.avgCostPerMessage, 5)}
        sub={t("metrics.avgCostConvSub")}
        delay={0.1}
      />
      <MetricBlock
        icon={Users}
        title={t("metrics.avgCostUser")}
        value={formatSmallUsdAmount(aggregates.costPerActiveUser, 5)}
        sub={t("metrics.avgCostUserSub")}
        delay={0.15}
      />
      <MetricBlock
        className="md:col-span-2 lg:col-span-2"
        icon={Cpu}
        title={t("metrics.tokensProcessed")}
        value={(aggregates.totalTokens ?? 0).toLocaleString()}
        sub={t("metrics.tokenSub", {
          input: (aggregates.totalInputTokens ?? 0).toLocaleString(),
          output: (aggregates.totalOutputTokens ?? 0).toLocaleString(),
        })}
        delay={0.2}
      />
    </div>
  );
}
