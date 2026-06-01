import { Activity } from "lucide-react";
import TimeframeDropdown from "@/src/ui/components/TimeframeDropdown";
import type { TimeframeOption } from "./types";

type AICostsHeaderProps = {
  customEnd: string;
  customStart: string;
  setCustomEnd: (value: string) => void;
  setCustomStart: (value: string) => void;
  setTimeframe: (value: TimeframeOption) => void;
  subtitle: string;
  timeframe: TimeframeOption;
  title: string;
};

export function AICostsHeader({
  customEnd,
  customStart,
  setCustomEnd,
  setCustomStart,
  setTimeframe,
  subtitle,
  timeframe,
  title,
}: AICostsHeaderProps) {
  return (
    <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Activity className="w-6 h-6 text-brand" />
          {title}
        </h1>
        <p className="text-[13px] text-secondary tracking-wide max-w-xl">{subtitle}</p>
      </div>

      <div className="flex flex-col items-end gap-3 z-20">
        <TimeframeDropdown
          timeframe={timeframe}
          setTimeframe={setTimeframe}
          customStart={customStart}
          setCustomStart={setCustomStart}
          customEnd={customEnd}
          setCustomEnd={setCustomEnd}
        />
      </div>
    </header>
  );
}
