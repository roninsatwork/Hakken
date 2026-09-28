"use client";

/**
 * One figure of what a company costs: a label, the amount and a line under it.
 *
 * Shared by the Data collection screen's cost-to-serve card and the Collection
 * runs screens, which show the same kind of figure four times each — lifted
 * out of `CollectionCost.tsx` rather than copied.
 */
export function CostFigure({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string;
  value: string;
  hint: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-[12px] border px-4 py-3 ${
        // The figure the eye should land on first.
        emphasis ? "border-brand/40 bg-brand/5" : "border-border-dim bg-card/40"
      }`}
    >
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted">{label}</span>
      <span className="font-mono text-[20px] leading-none text-foreground">{value}</span>
      <span className="text-[11px] leading-relaxed text-muted">{hint}</span>
    </div>
  );
}

/** Dollars to the cent, as every cost screen in admin shows them. */
export function dollars(value: number): string {
  return `$${value.toFixed(2)}`;
}

/**
 * Dollars too small for cents alone — $0.003 a Google check, $0.067 a press
 * of Generate — written the way `dollars` writes them, with no "US" in front
 * (a prompt's fan-out queries, prompt-fan-out-queries-plan.md).
 */
export function smallDollars(value: number): string {
  if (value === 0) return "$0";
  const digits = value < 0.01 ? 4 : value < 1 ? 3 : 2;
  return `$${Number(value.toFixed(digits))}`;
}
