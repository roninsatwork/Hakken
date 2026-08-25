"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import { AICostLeaderboards } from "./_components/AICostLeaderboards";
import { AICostsHeader } from "./_components/AICostsHeader";
import { AICostsMetricGrid } from "./_components/AICostsMetricGrid";
import type { AICostsData, TimeframeOption } from "./_components/types";
import { AiWorkspaceNav } from "../_components/AiWorkspaceNav";

const AICostDistributionCharts = dynamic(() =>
  import("./_components/AICostDistributionCharts").then((module) => module.AICostDistributionCharts),
);
const AICostTimelineChart = dynamic(() =>
  import("./_components/AICostTimelineChart").then((module) => module.AICostTimelineChart),
);

export default function AICostsDashboard() {
  const [timeframe, setTimeframe] = useState<TimeframeOption>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const t = useTranslations("ai.costs");
  const adminOverview = useTranslations("admin.overview");

  const data = useQuery(api.analytics.getGlobalAnalytics, {
    timeframe,
    customStart: timeframe === "custom" && customStart ? new Date(customStart).getTime() : undefined,
    customEnd: timeframe === "custom" && customEnd ? new Date(customEnd).getTime() + 86399999 : undefined,
  }) as AICostsData | undefined;

  const getAggregationLabel = (aggregationType: string) => {
    if (aggregationType === "month") return adminOverview("charts.monthly") || t("aggregation.month");
    if (aggregationType === "week") return adminOverview("charts.weekly") || t("aggregation.week");
    return adminOverview("charts.daily") || t("aggregation.day");
  };

  return (
    <div className="flex flex-col gap-8 w-full pb-12 antialiased">
      <AICostsHeader
        customEnd={customEnd}
        customStart={customStart}
        setCustomEnd={setCustomEnd}
        setCustomStart={setCustomStart}
        setTimeframe={setTimeframe}
        subtitle={t("subtitle")}
        timeframe={timeframe}
        title={t("title")}
      />
      <AiWorkspaceNav />

      {data === undefined ? (
        <div className="w-full h-[400px] flex items-center justify-center p-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand opacity-80" />
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-8 w-full">
          <AICostTimelineChart
            aggregationLabel={getAggregationLabel(data.aggregates.aggregationType)}
            noDataLabel={adminOverview("charts.noData")}
            t={t}
            timeline={data.timeline}
          />
          <AICostsMetricGrid aggregates={data.aggregates} t={t} />
          <AICostDistributionCharts
            modelDistribution={data.modelDistribution}
            providerDistribution={data.providerDistribution}
            timeline={data.timeline}
          />
          <AICostLeaderboards
            adminOverview={adminOverview}
            topAgents={data.topAgents}
            topCompanies={data.topCompanies}
            topUsers={data.topUsers}
          />
        </motion.div>
      )}
    </div>
  );
}
