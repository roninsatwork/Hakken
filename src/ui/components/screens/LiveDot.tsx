import { CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";

/**
 * A small pulsing dot: this figure is live (docs/plans/active/live-new-page-plan-2026-11-06.md; Anthony, 2026-11-06, "pep it up",
 * new parts allowed as long as they're shared). Google Analytics' Live page first. It stops pulsing for anyone who asks for less
 * motion. It says nothing to a screen reader, so the words beside it must say it's live.
 */
export function LiveDot() {
  return (
    <span data-part="live-dot" aria-hidden className="relative inline-flex h-2.5 w-2.5 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full motion-reduce:animate-none" style={{ backgroundColor: CHART_SERIES_ORANGE, opacity: 0.75 }} />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_SERIES_ORANGE }} />
    </span>
  );
}
