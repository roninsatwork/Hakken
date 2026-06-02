import { motion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, PieChart as PieChartIcon } from "lucide-react";
import ChartExportWrapper from "@/src/ui/components/charts/ChartExportWrapper";
import type { ModelDistributionRow, TimelinePoint } from "./types";
import { formatTokenAxisTick } from "./costFormatters";

const MODEL_COLORS = ["#8b5cf6", "#10b981", "#f43f5e", "#3b82f6", "#f59e0b", "#14b8a6"];

type AICostDistributionChartsProps = {
  modelDistribution?: ModelDistributionRow[];
  timeline?: TimelinePoint[];
};

export function AICostDistributionCharts({ modelDistribution, timeline }: AICostDistributionChartsProps) {
  return (
    <div className="flex flex-col gap-6 mt-2">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartExportWrapper exportName="ai-model-logistics" className="lg:col-span-1 flex flex-col h-full w-full">
          <motion.section
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
            className="bg-[#00000005] dark:bg-[#ffffff05] border border-border-dim rounded-[24px] shadow-lg backdrop-blur-xl flex flex-col min-h-[350px] w-full"
          >
            <div className="px-6 py-5 border-b border-border-dim bg-[#00000008] dark:bg-[#ffffff08] flex flex-col gap-1.5 rounded-t-[24px]">
              <div className="flex items-center gap-3">
                <PieChartIcon className="w-4 h-4 text-[#8b5cf6] opacity-80" />
                <h2 className="text-[14px] font-bold text-foreground">Model Invocations</h2>
              </div>
              <span className="text-[11px] font-mono tracking-widest text-muted opacity-60 uppercase">
                Cost drivers by LLM
              </span>
            </div>
            <div className="h-[260px] min-h-[260px] w-full flex items-center justify-center p-4">
              {!modelDistribution || modelDistribution.length === 0 ? (
                <div className="text-center text-secondary text-sm font-mono tracking-widest uppercase opacity-50">
                  No Data
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260} debounce={50}>
                  <PieChart>
                    <Pie
                      data={modelDistribution}
                      cx="50%"
                      cy="45%"
                      innerRadius={65}
                      outerRadius={85}
                      paddingAngle={5}
                      dataKey="calls"
                      stroke="none"
                    >
                      {modelDistribution.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={MODEL_COLORS[index % MODEL_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "rgba(0,0,0,0.8)",
                        borderRadius: "12px",
                        border: "1px solid rgba(255,255,255,0.1)",
                      }}
                      itemStyle={{ color: "#ffffff", fontSize: "13px", fontWeight: 600 }}
                      formatter={(value: unknown) => `${Number(value).toLocaleString()} Calls`}
                    />
                    <Legend
                      iconType="circle"
                      wrapperStyle={{
                        fontSize: "11px",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "#888",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </motion.section>
        </ChartExportWrapper>

        <ChartExportWrapper exportName="ai-token-flux" className="lg:col-span-1 flex flex-col h-full w-full">
          <motion.section
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-[#00000005] dark:bg-[#ffffff05] border border-border-dim rounded-[24px] shadow-lg backdrop-blur-xl flex flex-col min-h-[350px] w-full"
          >
            <div className="px-6 py-5 border-b border-border-dim bg-[#00000008] dark:bg-[#ffffff08] flex flex-col gap-1.5 rounded-t-[24px]">
              <div className="flex items-center gap-3">
                <BarChart3 className="w-4 h-4 text-[#10b981] opacity-80" />
                <h2 className="text-[14px] font-bold text-foreground">Token Flux</h2>
              </div>
              <span className="text-[11px] font-mono tracking-widest text-muted opacity-60 uppercase">
                Input vs Output Volume
              </span>
            </div>
            <div className="h-[260px] min-h-[260px] w-full flex items-center justify-center p-4">
              {!timeline || timeline.length === 0 ? (
                <div className="text-center text-secondary text-sm font-mono tracking-widest uppercase opacity-50">
                  No Data
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260} debounce={50}>
                  <BarChart data={timeline}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff10" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#888" }} dy={10} hide />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: "#888" }}
                      tickFormatter={formatTokenAxisTick}
                      width={40}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(255,255,255,0.05)" }}
                      contentStyle={{
                        backgroundColor: "rgba(0,0,0,0.8)",
                        borderRadius: "12px",
                        border: "1px solid rgba(255,255,255,0.1)",
                      }}
                      itemStyle={{ color: "#ffffff", fontSize: "13px", fontWeight: 600 }}
                    />
                    <Legend
                      iconType="circle"
                      wrapperStyle={{
                        fontSize: "11px",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "#888",
                      }}
                    />
                    <Bar dataKey="inputTokens" name="Input (Context)" stackId="a" fill="#10b981" radius={[0, 0, 4, 4]} />
                    <Bar dataKey="outputTokens" name="Output (Gen)" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </motion.section>
        </ChartExportWrapper>
      </div>
    </div>
  );
}
