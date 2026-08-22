import { Activity } from "lucide-react";
import TimeframeDropdown from "@/src/ui/components/TimeframeDropdown";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
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
    <PageHeader
      icon={<Activity className="w-6 h-6 text-brand" />}
      title={title}
      description={subtitle}
      divider
      action={
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
      }
    />
  );
}
