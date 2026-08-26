import { v } from "convex/values";

/** What the platform settings screens hand back. */

/**
 * Whatever JSON was last stored, not a shape.
 *
 * `updatePiiConfig` takes a raw JSON string and stores it unread — no
 * validation on the way in, and `parseSystemPiiConfig` only asserts a type over
 * `JSON.parse`. So the stored value can be missing every field this config is
 * supposed to have and can carry fields it never had; the repository's own test
 * stores `{ enabled: false, maskCharacter: "#" }` and expects it back.
 *
 * Declaring the real `PiiConfig` shape here would refuse that, which is a
 * change to what the write accepts rather than to what the read declares. That
 * is a product decision, so it is recorded in the plan's open list instead of
 * made here.
 */
export const piiConfigShape = v.any();
