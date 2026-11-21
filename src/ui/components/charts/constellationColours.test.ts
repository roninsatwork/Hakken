import { describe, expect, test } from "vitest";
import { DOTS_GROUND } from "@/src/ui/components/dots/dotsPalette";
import { WIKI_KIND_RGB } from "./chartPalette";

/**
 * The wiki map's kinds of page stay apart for Anthony, who is red/green colour blind (wiki-sonae-catch-up-plan-2026-11-21.md,
 * "The map's look"). The upstream colours had two pairs he'd see as one: Customers and Policies (1.9 apart, red-blind) and
 * Products and Issues (5.3, green-blind). Each colour is seen as normal, red-blind and green-blind sight sees it (Machado,
 * Oliveira and Fernandes, 2009, full strength), and every pair of kinds, and every kind against the map's dark ground, must
 * stay at least 15 apart (CIEDE2000). Under 10 is hard to tell apart; under 5 looks the same. A kind added later must pass too.
 */

type Rgb = readonly [number, number, number];

const SIGHTS: Record<string, readonly (readonly [number, number, number])[]> = {
  normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  redBlind: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  greenBlind: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
};

const linear = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const gamma = (c: number) => {
  const clipped = Math.max(0, Math.min(1, c));
  return (clipped <= 0.0031308 ? 12.92 * clipped : 1.055 * clipped ** (1 / 2.4) - 0.055) * 255;
};

function seenAs(rgb: Rgb, sight: string): Rgb {
  const l = rgb.map(linear);
  const m = SIGHTS[sight];
  return [0, 1, 2].map((row) => gamma(m[row][0] * l[0] + m[row][1] * l[1] + m[row][2] * l[2])) as unknown as Rgb;
}

function lab(rgb: Rgb): [number, number, number] {
  const [r, g, b] = rgb.map(linear);
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** CIEDE2000: how far apart two colours look. */
function apart(one: Rgb, other: Rgb): number {
  const [L1, a1, b1] = lab(one);
  const [L2, a2, b2] = lab(other);
  const rad = (d: number) => (d * Math.PI) / 180;
  const deg = (r: number) => ((r * 180) / Math.PI + 360) % 360;
  const Cbar = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h1p = deg(Math.atan2(b1, a1p));
  const h2p = deg(Math.atan2(b2, a2p));
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) dhp = Math.abs(h2p - h1p) <= 180 ? h2p - h1p : h2p - h1p > 180 ? h2p - h1p - 360 : h2p - h1p + 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));
  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  const hbp = C1p * C2p === 0 || Math.abs(h1p - h2p) <= 180 ? (h1p + h2p) / 2 : h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  const T = 1 - 0.17 * Math.cos(rad(hbp - 30)) + 0.24 * Math.cos(rad(2 * hbp)) + 0.32 * Math.cos(rad(3 * hbp + 6)) - 0.2 * Math.cos(rad(4 * hbp - 63));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7)) * Math.sin(rad(60 * Math.exp(-(((hbp - 275) / 25) ** 2))));
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

const hex = (value: string): Rgb => [1, 3, 5].map((at) => parseInt(value.slice(at, at + 2), 16)) as unknown as Rgb;
const LEAST = 15;

describe("the wiki map's kind colours, in every sight", () => {
  const kinds = Object.entries(WIKI_KIND_RGB);

  test.each(Object.keys(SIGHTS))("every two kinds stay at least 15 apart in %s sight", (sight) => {
    const close: string[] = [];
    for (let i = 0; i < kinds.length; i += 1) {
      for (let j = i + 1; j < kinds.length; j += 1) {
        const distance = apart(seenAs(kinds[i][1], sight), seenAs(kinds[j][1], sight));
        if (distance < LEAST) close.push(`${kinds[i][0]} and ${kinds[j][0]}: ${distance.toFixed(1)}`);
      }
    }
    expect(close, "Too close to tell apart. Change one colour in chartPalette.ts WIKI_KIND_RGB.").toEqual([]);
  });

  test.each(Object.keys(SIGHTS))("every kind stands out from the map's ground in %s sight", (sight) => {
    const ground = seenAs(hex(DOTS_GROUND), sight);
    const close = kinds.filter(([, rgb]) => apart(seenAs(rgb, sight), ground) < LEAST).map(([kind]) => kind);
    expect(close).toEqual([]);
  });

  test("the check itself finds the upstream colours' two pairs too close", () => {
    // Proof the test can fail: Customers and the upstream violet for Policies were one blue in red-blind sight.
    expect(apart(seenAs([57, 135, 229], "redBlind"), seenAs([144, 133, 233], "redBlind"))).toBeLessThan(5);
    expect(apart(seenAs([201, 133, 0], "greenBlind"), seenAs([217, 89, 38], "greenBlind"))).toBeLessThan(10);
  });
});
