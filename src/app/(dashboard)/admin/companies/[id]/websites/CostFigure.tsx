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
