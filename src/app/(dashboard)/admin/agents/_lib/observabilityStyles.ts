/**
 * Shapes that carry meaning on the observability screens, where colour alone
 * cannot.
 *
 * The owner of this platform cannot tell red from green, and these screens are
 * where a failure has to be unmissable. Everything here exists so that a state
 * survives being read in the wrong colours, printed in black and white, or
 * screenshotted into a document — which is what happens to these screens.
 *
 * Shared rather than page-local because the seven-day chart and the job
 * waterfall both mark a failure, and two definitions of "what a failure looks
 * like" is two chances for them to drift apart while sitting one click from
 * each other.
 */

/**
 * Diagonal stripes cut out of the card colour.
 *
 * Applied over a fill rather than replacing it: the colour still agrees with
 * the meaning for a reader who can see it, and the texture carries the same
 * meaning for a reader who cannot. A legend swatch wearing this is what lets
 * the legend be mapped by shape instead of by hue.
 */
export const FAILED_HATCH = {
  backgroundImage:
    "repeating-linear-gradient(135deg, transparent 0 2px, var(--color-card) 2px 3px)",
} as const;
