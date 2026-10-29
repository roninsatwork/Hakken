/**
 * Where the rain lands on a pre-sign-in screen's right half, and when.
 *
 * Seen from above: each drop lands every `period` seconds at its own moment
 * and sends three rings out that fade; one in seven lands harder, with a
 * bigger ring in the brand's ivory. The places are worked out from the drop's
 * number, never from Math.random, so the server and the browser draw the same
 * rain and the look tests see the same page every time. The numbers are the
 * approved drawing's (docs/plans/assets/home-page/Rain.dc.html).
 */
export type RainDrop = {
  id: number;
  /** Per cent of the panel's width and height. */
  x: number;
  y: number;
  /** The biggest ring's width, in pixels. */
  size: number;
  hard: boolean;
  /** Seconds between landings, and the (negative) start so the rain is already falling. */
  period: number;
  delay: number;
};

export const RAIN_DROPS = 34;

const fraction = (n: number) => n - Math.floor(n);

export function rainDrops(): RainDrop[] {
  const drops: RainDrop[] = [];
  for (let i = 0; i < RAIN_DROPS; i++) {
    const a = Math.sin(i * 12.9898) * 43758.5453;
    const b = Math.sin(i * 78.233) * 12345.678;
    const c = Math.sin(i * 39.425) * 9876.543;
    const hard = i % 7 === 3;
    const period = 5 + Math.round(fraction(c) * 4);
    drops.push({
      id: i,
      x: Math.round((fraction(a) * 90 + 5) * 10) / 10,
      y: Math.round((fraction(b) * 88 + 6) * 10) / 10,
      size: hard ? 260 : 120 + Math.round(fraction(c) * 80),
      hard,
      period,
      delay: -Math.round(fraction(a + b) * period * 10) / 10,
    });
  }
  return drops;
}
