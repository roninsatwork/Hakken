"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useElementWidth } from "@/src/hooks/useElementWidth";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { ChartTooltipRow, ChartTooltipSurface } from "@/src/ui/components/charts/ChartTooltip";

/**
 * A figure as whole squares a person can count: out of every 100, or every 1,000 for something rare, each colour one row of
 * the key beside it (Anthony, 2026-11-06, Overview's Way 3: "this is lovely"). For any split of any figure. It's handed plain
 * counts and words and reads nothing; `outOfTotal` makes counts that always add up. Rolling over a square lights its row and
 * the other way round, and pressing keeps it lit. Drawn in real pixels, so it never grows with the screen.
 */

export type HundredGroup = {
  key: string;
  name: string;
  count: number;
  colour: string;
  /** Beside the name: what it's set against, as the page says it. */
  was?: ReactNode;
  /** On hover, in this order. */
  readout: ReadonlyArray<{ value: string; label: string }>;
};

/** The space each size of grid takes. A thousand squares go narrower on a small screen, so they still fit. */
function shapeOf(cells: number, width: number) {
  if (cells <= 100) return { columns: 10, size: 30, gap: 4 };
  return width > 0 && width < 480 ? { columns: 25, size: 10, gap: 2 } : { columns: 40, size: 8, gap: 1 };
}

const KEY_COLUMNS = ["22px", "64px", "minmax(0,1fr)", "auto"].join(" ");
/** The width it takes for the squares and their key to sit side by side. */
const SIDE_BY_SIDE = 640;
/** How long the squares take to fill in, whatever their number. */
const FILL_MS = 1200;

export function HundredGrid({ groups, cells = 100, nowLabel, wasLabel, label }: {
  groups: readonly HundredGroup[];
  cells?: number;
  /** The heading over the counts: "October". */
  nowLabel: string;
  /** The heading over what it's set against. Empty with nothing to set it against. */
  wasLabel: string;
  /** What a screen reader says the grid is. */
  label: string;
}) {
  const [watch, width] = useElementWidth<HTMLDivElement>();
  const still = useReducedMotion();
  const [lit, setLit] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const tip = useRef<HTMLDivElement>(null);
  // The squares fill in once, then stay still, so a change of menu only fades their colours.
  const [filling, setFilling] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setFilling(false), FILL_MS);
    return () => clearTimeout(timer);
  }, []);
  const { columns, size, gap } = shapeOf(cells, width);
  const squares = groups.flatMap((group) => Array.from({ length: group.count }, () => group));
  const rows = Math.ceil(cells / columns);
  const shown = hover ?? lit;
  const hovered = hover ? groups.find((group) => group.key === hover) : null;
  const dimmed = (key: string) => shown !== null && shown !== key;
  // The readout follows the pointer without drawing the squares again.
  const onMove = (event: MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - box.left;
    if (!tip.current) return;
    tip.current.style.left = `${x}px`;
    tip.current.style.top = `${event.clientY - box.top}px`;
    tip.current.style.transform = `translate(${width > 0 && x > width - 260 ? "calc(-100% - 12px)" : "12px"}, 12px)`;
  };
  const toggle = (key: string) => setLit((held) => (held === key ? null : key));

  return (
    // Only leaving the whole part lets go: the pointer crossing the gap between two squares must not, or the chart flickers (Anthony, 2026-11-06).
    // Side by side only when there's room for both, by the part's own width: a narrow column on a wide window squeezed the key (Anthony, 2026-11-06).
    <div ref={watch} data-part="hundred-grid" className={width >= SIDE_BY_SIDE ? "relative flex flex-row items-center gap-10" : "relative flex flex-col gap-6"} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <div
        role="img"
        aria-label={[label, ...groups.map((group) => `${group.count} ${group.name}`)].join(", ")}
        className="grid shrink-0"
        style={{ width: size * columns + gap * (columns - 1), height: size * rows + gap * (rows - 1), gridTemplateColumns: `repeat(${columns}, ${size}px)`, gridAutoRows: `${size}px`, gap }}
      >
        {squares.map((group, at) => (
          <span
            key={at}
            data-square={group.key}
            className={still ? "block cursor-pointer" : "block cursor-pointer transition-[opacity,background-color] duration-200 ease-out"}
            onMouseEnter={() => setHover(group.key)}
            onClick={() => toggle(group.key)}
            style={{
              backgroundColor: group.colour,
              borderRadius: size < 14 ? 2 : 4,
              opacity: dimmed(group.key) ? 0.25 : 1,
              ...(filling && !still ? { animationName: "hk-square-fill", animationDuration: "240ms", animationTimingFunction: "ease-out", animationFillMode: "backwards", animationDelay: `${Math.round((at / Math.max(1, cells)) * (FILL_MS - 240))}ms` } : {}),
            }}
          />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="grid items-baseline border-b border-border-dim/50 pb-2 text-[12px] text-muted" style={{ gridTemplateColumns: KEY_COLUMNS, columnGap: 8 }}>
          <span />
          <span>{nowLabel}</span>
          <span />
          <span className="text-right">{wasLabel}</span>
        </div>
        {groups.map((group) => (
          <div
            key={group.key}
            role="button"
            tabIndex={0}
            aria-pressed={lit === group.key}
            data-key={group.key}
            onClick={() => toggle(group.key)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              toggle(group.key);
            }}
            onMouseEnter={() => setHover(group.key)}
            className="grid cursor-pointer items-center border-b border-border-dim/50 py-3 transition-colors last:border-b-0 hover:bg-hover"
            style={{ gridTemplateColumns: KEY_COLUMNS, columnGap: 8, opacity: dimmed(group.key) ? 0.45 : 1 }}
          >
            <span className="block h-3.5 w-3.5 rounded-[3px]" style={{ backgroundColor: group.colour }} />
            <span className="font-mono text-[24px] font-semibold tabular-nums text-foreground">{group.count}</span>
            <span className="min-w-0 text-[14px] text-foreground">{group.name}</span>
            <span className="text-right font-mono text-[13px] text-secondary">{group.was}</span>
          </div>
        ))}
      </div>
      <div ref={tip} className="pointer-events-none absolute z-10" style={{ visibility: hovered ? "visible" : "hidden" }}>
        {hovered ? (
          <ChartTooltipSurface heading={hovered.name} wide>
            {hovered.readout.map((line) => <ChartTooltipRow key={line.label} value={line.value} label={line.label} />)}
          </ChartTooltipSurface>
        ) : null}
      </div>
    </div>
  );
}
