import { v, type Infer } from "convex/values";

/**
 * Charts in email, as pictures (docs/plans/active/hakken-tasks-plan.md, item
 * 3.2). Gmail removes a chart drawn in markup, and a picture linked from the
 * web is blocked until the reader allows it, so the chart is drawn here into
 * a small image that travels with the email as an attachment and is shown by
 * its content id (`cid:`), which mail clients show without asking.
 *
 * The picture carries no words and no figure the email does not also say:
 * its dates, its line's value and its figures are written beside it, so a
 * reader who cannot see it misses nothing (`emailLayoutService.ts`). This file
 * is plain code — what to draw, as pixels — and the Email Sender, which runs in
 * Node, encodes it (`emailPictureEncoder.ts`).
 */

/** Bars, one a day, the days that met the rule marked; and the rule's line across, when it has a number. */
export const barsPictureValidator = v.object({
  values: v.array(v.number()),
  marked: v.array(v.boolean()),
  line: v.optional(v.number()),
});
export type BarsPicture = Infer<typeof barsPictureValidator>;

/** A picture an email carries: its content id, and what to draw. */
export const emailPictureValidator = v.object({ cid: v.string(), bars: barsPictureValidator });
export type EmailPicture = Infer<typeof emailPictureValidator>;

/** As drawn on the board (EmailAlertB): 512 by 120, drawn twice as large for sharp screens. */
export const PICTURE_WIDTH = 512;
export const PICTURE_HEIGHT = 120;
export const PICTURE_SCALE = 2;

/**
 * The picture's four colours, as palette indexes: the sheet, a usual day's
 * bar (the boards' slate at 45%, laid on white), a marked day's bar, and the
 * line. Bars are graphics, not words, so they need 3:1 against the sheet: the
 * marked orange is the deeper #ea580c (3.56), as the boards' #f97316 is 2.80.
 */
export const PICTURE_PALETTE: ReadonlyArray<readonly [number, number, number]> = [
  [0xff, 0xff, 0xff],
  [0xd3, 0xd9, 0xe1],
  [0xea, 0x58, 0x0c],
  [0x76, 0x76, 0x76],
];

export type Raster = { width: number; height: number; pixels: Uint8Array };

/**
 * The bars as pixels, one palette index each: as many bars as days, a gap
 * between, the tallest reaching near the top; and the line dashed across at
 * its value. A day with nothing shows as a sliver, so it reads as a day.
 */
export function rasterBars(picture: BarsPicture, scale = PICTURE_SCALE): Raster {
  const width = PICTURE_WIDTH * scale;
  const height = PICTURE_HEIGHT * scale;
  const pixels = new Uint8Array(width * height);
  const count = picture.values.length;
  if (count === 0) return { width, height, pixels };

  const top = Math.max(...picture.values, picture.line ?? 0, 1);
  const headroom = 0.9;
  const slot = width / count;
  const gap = Math.max(scale, Math.round(slot * 0.22));
  const fill = (x0: number, y0: number, x1: number, y1: number, colour: number) => {
    for (let y = Math.max(0, y0); y < Math.min(height, y1); y += 1) {
      pixels.fill(colour, y * width + Math.max(0, x0), y * width + Math.min(width, x1));
    }
  };

  picture.values.forEach((value, index) => {
    const barHeight = Math.max(scale, Math.round((value / top) * height * headroom));
    const x0 = Math.round(index * slot);
    const x1 = Math.round((index + 1) * slot) - gap;
    fill(x0, height - barHeight, x1, height, picture.marked[index] ? 2 : 1);
  });

  if (picture.line !== undefined && picture.line > 0) {
    const y = height - Math.round((picture.line / top) * height * headroom);
    const dash = 4 * scale;
    for (let x = 0; x < width; x += dash * 2) fill(x, y, x + dash, y + scale, 3);
  }
  return { width, height, pixels };
}
