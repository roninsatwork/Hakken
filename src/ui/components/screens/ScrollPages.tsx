"use client";

import Link from "next/link";
import { ChartReveal } from "./ChartReveal";

/**
 * How far down people scroll each of several pages, drawn as the pages themselves (dashboard-way-1-plan-2026-11-21.md,
 * "ScrollPages"; Anthony, 21 November 2026, of the plain bars it replaced: "this chart is boring"). Each page is a tall
 * shape filled from the top as far down as people scrolled, coloured by its Classification, with a dashed line at the
 * whole website's average. Shared, so Clarity's own pages can use it for any set of pages.
 *
 * Plain HTML, sized by its grid, so it never stretches words on a wide screen (`src/chart-size-drift.test.ts`).
 */
export type ScrollPage = {
  key: string;
  /** The page's address, as the app writes one. */
  label: string;
  href?: string;
  visits: number;
  /** How far down people scrolled, on average, out of 100. */
  scroll: number;
  /** A colour from `chartPalette.ts`, the page's Classification's. */
  colour: string;
};

export function ScrollPages({ pages, average, visitsWord, averageWord, legend }: {
  pages: readonly ScrollPage[];
  /** The whole website's average, out of 100: the dashed line. */
  average: number | null;
  /** "{count} visits", worded and formatted by the screen. */
  visitsWord: (count: number) => string;
  /** What a screen reader hears for the dashed line. */
  averageWord: string;
  legend?: ReadonlyArray<{ name: string; colour: string }>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <ChartReveal replay={pages.map((page) => `${page.key}:${Math.round(page.scroll)}`).join("|")} motion="fall" figures="[data-scroll-fill]">
      <div data-part="scroll-pages" className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.max(pages.length, 1)}, minmax(0, 1fr))` }}>
        {pages.map((page) => {
          const scroll = Math.max(0, Math.min(100, Math.round(page.scroll)));
          return (
            <div key={page.key} className="flex min-w-0 flex-col items-center gap-2">
              <div
                role="img"
                aria-label={`${page.label}: ${scroll}%`}
                className="relative w-full overflow-hidden rounded-[10px] border border-border-dim bg-foreground/5"
                style={{ height: 200, maxWidth: 96 }}
              >
                <div data-scroll-fill="" data-reveal="fall" className="absolute inset-x-0 top-0" style={{ height: `${scroll}%`, backgroundColor: page.colour, opacity: 0.85 }} />
                {average !== null ? (
                  <div aria-label={averageWord} className="absolute inset-x-0 border-t border-dashed border-foreground/45" style={{ top: `${Math.round(average)}%` }} />
                ) : null}
                <span className="absolute inset-x-0 text-center font-mono text-[12px] text-foreground" style={{ top: `${scroll}%`, marginTop: 4 }}>
                  {scroll}%
                </span>
              </div>
              {page.href ? (
                <Link href={page.href} title={page.label} className="block w-full truncate text-center text-[12px] text-info hover:underline">{page.label}</Link>
              ) : (
                <span title={page.label} className="block w-full truncate text-center text-[12px] text-info">{page.label}</span>
              )}
              <span className="text-center text-[12px] text-secondary">{visitsWord(page.visits)}</span>
            </div>
          );
        })}
      </div>
      </ChartReveal>
      {legend && legend.length > 0 ? (
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] text-secondary">
          {legend.map((item) => (
            <span key={item.name} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-3 w-3 rounded-[3px]" style={{ backgroundColor: item.colour }} />
              {item.name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
