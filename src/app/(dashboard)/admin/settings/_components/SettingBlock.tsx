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

type ColorInputProps = {
  label: string;
  /** One plain sentence saying where in the app this colour is used. */
  sub?: string;
  value: string;
  onChange: (value: string) => void;
  /** The shipped default; when given, a reset control restores it. */
  defaultValue?: string;
  /**
   * Allow transparency. The CSS defaults for borders and hover are
   * translucent, and a bare colour swatch can only write opaque hex — which
   * silently flattened the look the moment either row was touched. With
   * alpha on, the value is stored as 8-digit hex (#RRGGBBAA).
   */
  alpha?: boolean;
  resetLabel?: string;
};

function splitAlphaHex(value: string): { rgb: string; alphaPercent: number } {
  const match = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(value || "");
  if (!match) return { rgb: value || "#000000", alphaPercent: 100 };
  const alphaByte = match[2] ? parseInt(match[2], 16) : 255;
  return { rgb: `#${match[1]}`, alphaPercent: Math.round((alphaByte / 255) * 100) };
}

function composeAlphaHex(rgb: string, alphaPercent: number): string {
  if (alphaPercent >= 100) return rgb.toUpperCase();
  const clamped = Math.max(0, Math.min(100, alphaPercent));
  const byte = Math.round((clamped / 100) * 255).toString(16).padStart(2, "0");
  return `${rgb.toUpperCase()}${byte.toUpperCase()}`;
}

export function ColorInput({ label, sub, value, onChange, defaultValue, alpha, resetLabel }: ColorInputProps) {
  const { rgb, alphaPercent } = splitAlphaHex(value);
  const displayValue = value ? value.toUpperCase() : "";

  return (
    <div className="flex items-center justify-between gap-3 bg-background/50 border border-border-dim p-2 rounded-[16px]">
      <div className="flex flex-col ml-3 min-w-0 py-1">
        <span className="text-[13px] font-mono tracking-tight text-secondary">{label}</span>
        {sub ? <span className="text-[11px] text-muted leading-snug mt-0.5">{sub}</span> : null}
      </div>
      <div className="flex items-center gap-3 pr-2 flex-shrink-0">
        {defaultValue && value && value.toUpperCase() !== defaultValue.toUpperCase() ? (
          <button
            type="button"
            onClick={() => onChange(defaultValue.toUpperCase())}
            className="text-[10px] font-semibold text-muted hover:text-foreground transition-colors underline decoration-dotted underline-offset-2"
          >
            {resetLabel ?? "Reset"}
          </button>
        ) : null}
        {alpha ? (
          <label className="flex items-center gap-1 text-[11px] font-mono text-muted">
            <input
              type="number"
              min={0}
              max={100}
              value={alphaPercent}
              onChange={(event) => onChange(composeAlphaHex(rgb, Number(event.target.value)))}
              className="w-[52px] bg-transparent border border-border-dim rounded-[6px] px-1.5 py-0.5 text-right text-foreground outline-none focus:border-brand"
              aria-label={`${label} opacity`}
            />
            %
          </label>
        ) : null}
        <span className="text-[13px] font-mono text-foreground tracking-widest uppercase">{displayValue}</span>
        <label className="cursor-pointer relative flex items-center justify-center">
          <input
            type="color"
            value={rgb}
            onChange={(event) => onChange(
              alpha ? composeAlphaHex(event.target.value, alphaPercent) : event.target.value.toUpperCase()
            )}
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
