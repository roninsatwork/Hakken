/**
 * The colours of the moving dots: the wiki map's starfield (WikiConstellation.tsx).
 *
 * A sanctioned domain palette, like `chartPalette.ts`: the dots are drawn on a
 * canvas, one colour per dot, so they cannot take a theme token. Anthony chose
 * this look for the wiki map on 2026-11-21, "same as" the upstream framework's
 * (wiki-sonae-catch-up-plan-2026-11-21.md, S3), where it was first drawn for
 * the sign-in screens.
 *
 * Dots are grouped into a fixed number of colour buckets so each frame paints
 * a few dozen shapes rather than one fill per dot.
 */

/** How many colour groups a frame is painted in. */
export const DOT_BUCKETS = 30;

/** The ground the dots sit on. */
export const DOTS_GROUND = "#100d18";

/** The loose white dots that drift around the coloured ones. */
export const DOTS_STAR = "rgba(244, 241, 250, 0.55)";

/** The loose dust around the voice ball, before its own transparency. */
export const DOTS_DUST = "rgb(244, 241, 250)";

/**
 * The near-black ground of the voice conversation screen, as drawn on the
 * signed-off canvas. The screen forces the app's dark theme for its words, so
 * only this ground comes from here.
 */
export const DOTS_SCREEN_GROUND = "#0c0a12";

/**
 * The rainbow: blue at the top through pink to gold at the bottom, sliding
 * slowly round the colour wheel over time.
 */
export function rainbowHue(yRatio: number, xRatio: number, seconds: number): number {
  const hue = 190 + yRatio * 230 + xRatio * 40 + seconds * 22;
  return ((hue % 360) + 360) % 360;
}

/** Which colour group a hue falls in. */
export function hueBucket(hue: number): number {
  return Math.floor(hue / (360 / DOT_BUCKETS)) % DOT_BUCKETS;
}

/** The paint for one rainbow group, at a given lightness. */
export function rainbowFill(bucket: number, lightness = 64): string {
  const hue = Math.round((bucket + 0.5) * (360 / DOT_BUCKETS));
  return `hsl(${hue}, 95%, ${lightness}%)`;
}

/**
 * A company's own colour, spread into one shade per group.
 *
 * The kiosk wears the company's brand rather than the rainbow (agreed
 * 2026-11-11), so each group gets the brand's hue and saturation at a
 * different lightness. A colour that cannot be read falls back to the brand
 * orange rather than drawing nothing. The lightness stays in the middle of
 * the range so the dots read on a light kiosk screen as well as a dark one.
 */
export function brandFills(colour: string | undefined, lightnessOffset = 0): string[] {
  const { h, s } = toHueSaturation(colour) ?? { h: 16, s: 100 };
  const saturation = Math.max(55, s);
  const fills: string[] = [];
  for (let bucket = 0; bucket < DOT_BUCKETS; bucket += 1) {
    const lightness = 38 + (bucket / (DOT_BUCKETS - 1)) * 30 + lightnessOffset;
    fills.push(`hsl(${Math.round(h)}, ${Math.round(saturation)}%, ${Math.round(Math.max(18, Math.min(88, lightness)))}%)`);
  }
  return fills;
}

/** Hue and saturation of a hex colour, or null when it is not one. */
export function toHueSaturation(colour: string | undefined): { h: number; s: number } | null {
  if (!colour) return null;
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour.trim());
  if (!match) return null;
  const hex =
    match[1].length === 3
      ? match[1]
          .split("")
          .map((c) => c + c)
          .join("")
      : match[1];
  const value = parseInt(hex, 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0 };
  const s = delta / (1 - Math.abs(2 * lightness - 1));
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s: s * 100 };
}

/** The wiki map's links: a faint line, brighter when its page is in focus, and the dust that runs along it. */
export const DOTS_LINK = "rgba(244, 241, 250, 0.10)";
export const DOTS_LINK_FADED = "rgba(244, 241, 250, 0.04)";
export const DOTS_LINK_LIT = "rgba(244, 241, 250, 0.55)";
export const DOTS_LINK_DUST = "rgba(244, 241, 250, 0.35)";
export const DOTS_LINK_DUST_LIT = "rgba(255, 255, 255, 0.9)";
/** The wiki map's page names, drawn on the dots. */
export const DOTS_LABEL = "rgba(244, 241, 250, 0.8)";
export const DOTS_LABEL_FOCUS = "#ffffff";
