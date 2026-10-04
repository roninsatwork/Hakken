import type { ReactNode } from "react";

/**
 * A figure with its move on a short line underneath — "a before and after in
 * one column" (search-console-plan §13.1). Folding the move into its figure is
 * how a table with many figures fits the page (design-drift-plan D4,
 * Anthony 2026-10-04: "go"): the tracked lists' Clicks and Position, and
 * Fan-out queries' Position. No move, no second line — a dash under every
 * still row would only be noise.
 */
export function FigureWithMove({ figure, move }: { figure: ReactNode; move: ReactNode | null }) {
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      {figure}
      {move}
    </span>
  );
}
