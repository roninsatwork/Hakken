import type { ReactNode } from "react";
import { motion } from "framer-motion";

type SettingBlockProps = {
  title: string;
  sub: string;
  children: ReactNode;
};

export function SettingBlock({ title, sub, children }: SettingBlockProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-6 p-8 rounded-[24px] bg-card/40 backdrop-blur-2xl border border-border-dim shadow-sm relative overflow-hidden group hover:border-brand/30 transition-colors"
    >
      <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 blur-[60px] rounded-full pointer-events-none -translate-y-20 translate-x-20 group-hover:bg-brand/10 transition-colors" />
      <div className="flex flex-col gap-1 relative z-10">
        <h2 className="text-[16px] font-bold text-foreground">{title}</h2>
        <p className="text-[12px] text-muted tracking-wide">{sub}</p>
      </div>
      <div className="relative z-10 w-full">
        {children}
      </div>
    </motion.div>
  );
}

export function ColorInput({ label, value, onChange }: { label: string, value: string, onChange: (value: string) => void }) {
  const displayValue = value ? value.toUpperCase() : "";
  const hexValue = value || "#000000";

  return (
    <div className="flex items-center justify-between bg-background/50 border border-border-dim p-2 rounded-[16px]">
      <span className="text-[13px] font-mono tracking-tight text-secondary ml-3">{label}</span>
      <div className="flex items-center gap-3 pr-2">
        <span className="text-[13px] font-mono text-foreground tracking-widest uppercase">{displayValue}</span>
        <label className="cursor-pointer relative flex items-center justify-center">
          <input
            type="color"
            value={hexValue}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
            className="w-8 h-8 rounded-[6px] cursor-pointer opacity-0 absolute inset-0 z-10"
          />
          <div
            className="w-8 h-8 rounded-[6px] shadow-sm border border-border-dim/50 pointer-events-none"
            style={{ backgroundColor: value ? value : "transparent" }}
          />
        </label>
      </div>
    </div>
  );
}
