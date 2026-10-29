import type { CSSProperties } from "react";
import { rainDrops } from "./rainDrops";

/**
 * Rain landing on the ground, seen from above: the symbol of every screen
 * before sign-in (Anthony, 2026-10-29). Pure CSS motion from rain.css, so it
 * costs no script and stops for anyone who asks for reduced motion.
 * Decorative: hidden from assistive technology, with nothing to read in it.
 */
export function RainField() {
  return (
    <div aria-hidden="true" className="absolute inset-0">
      <div className="hk-rain-sheen absolute inset-x-0 -inset-y-[10%]" />
      {rainDrops().map((drop) => (
        <span
          key={drop.id}
          className="hk-drop"
          style={
            {
              left: `${drop.x}%`,
              top: `${drop.y}%`,
              "--hk-size": `${drop.size}px`,
              "--hk-period": `${drop.period}s`,
              "--hk-delay": `${drop.delay}s`,
              "--hk-ring": drop.hard ? "var(--brand)" : "var(--text-secondary)",
            } as CSSProperties
          }
        >
          <i className="hk-splash" />
          <i className="hk-ring hk-ring-1" />
          <i className="hk-ring hk-ring-2" />
          <i className="hk-ring hk-ring-3" />
        </span>
      ))}
    </div>
  );
}
