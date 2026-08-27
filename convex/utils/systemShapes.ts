import { v } from "convex/values";

/** What the platform settings screens hand back. */

/**
 * The five masking switches, and nothing else.
 *
 * This was `v.any()` until 2026-08-27, honestly: `updatePiiConfig` stored
 * whatever JSON string it was handed without reading it, so the read could not
 * promise a shape. The write validates now — the retention screen has always
 * done so — and the read fills anything absent from the defaults, so five
 * booleans is what comes back and this can say so.
 */
export const piiConfigShape = v.object({
  enabled: v.boolean(),
  maskEmails: v.boolean(),
  maskCreditCards: v.boolean(),
  maskPhones: v.boolean(),
  maskNinos: v.boolean(),
});
