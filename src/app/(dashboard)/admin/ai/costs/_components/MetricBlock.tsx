import type { ReactNode } from "react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

type MetricBlockProps = {
  className?: string;
  delay?: number;
  icon: LucideIcon;
  largeText?: boolean;
  sub: ReactNode;
  title: string;
  value: ReactNode;
};

export function MetricBlock({
  className = "",
  delay = 0,
  icon: Icon,
  largeText = false,
  sub,
  title,
  value,
}: MetricBlockProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={`flex flex-col gap-3 p-6 rounded-[20px] bg-card/40 backdrop-blur-2xl border border-border-dim shadow-sm relative overflow-hidden group hover:border-brand/30 transition-colors ${className}`}
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-brand/5 blur-[40px] rounded-full pointer-events-none -translate-y-10 translate-x-10 group-hover:bg-brand/10 transition-colors" />
      <div className="flex items-center gap-3 text-secondary">
        <Icon className="w-5 h-5 opacity-70 text-brand" />
        <span className="text-[13px] font-medium tracking-wide">{title}</span>
      </div>
      <div className="flex flex-col gap-1 z-10">
        <span
          className={`${largeText ? "text-5xl lg:text-7xl mb-2 mt-4" : "text-3xl"} font-bold tracking-tight text-foreground`}
        >
          {value}
        </span>
        <span className="text-[11px] font-mono tracking-widest uppercase text-muted/80">{sub}</span>
      </div>
    </motion.div>
  );
}
