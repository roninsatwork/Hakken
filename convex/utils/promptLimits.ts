/**
 * The bounds on a question, and on how many a website may hold.
 *
 * Constants only, in `utils/` because a client screen reads them and importing
 * a Convex module that defines functions ships the backend to the browser.
 * They lived in `seoPrompts.ts` until the per-client `trackedPrompts` table was
 * retired on 2026-09-22; that module's functions went with the table, and what
 * was left was these.
 */

/** The longest a question may be. It is sent verbatim, so it is bounded at save. */
export const MAX_PROMPT_LENGTH = 300;

/** The shortest question worth asking an engine. */
export const MIN_PROMPT_LENGTH = 8;

/**
 * How many questions one website may hold, by default.
 *
 * **Deliberately not a restriction at the moment.** Each question is a paid
 * call per engine per collection, so this is the meter that decides what AI
 * citation tracking costs — and the number it should be is unknown until real
 * invoices arrive. Anthony, 2026-09-22: *"I want the platform unrestricted
 * until we have this review."*
 *
 * So the mechanism stays and the number is set high enough not to bite. It was
 * ten, which is the figure to come back to when the meters are decided: ten
 * questions across four engines is forty charges every time a website is
 * collected. Spend is on the ledger, the pulls list and the cost screens
 * throughout, which is the condition that made lifting it safe.
 *
 * One thing this no longer is: a *per-client* allowance. Questions moved onto
 * the host, and the plan field that set one — `plans.seoPromptsPerWebsite` —
 * came off the schema and the plans screen on 2026-09-22, because a setting
 * nothing enforces is a screen saying something untrue. No plan row held it:
 * the field never reached `main`, and dev had no plans.
 */
export const DEFAULT_PROMPTS_PER_WEBSITE = 1_000;

/** Below this the feature does nothing, so it is not a setting, it is "off". */
export const MIN_PROMPTS_PER_WEBSITE = 1;

/**
 * The most a super admin may set it to.
 *
 * A hard ceiling on the setting itself, not just on the form: a typed extra
 * zero should be refused rather than billed. It also bounds how many questions
 * one collection reads per website, so the two must move together.
 */
export const MAX_PROMPTS_PER_WEBSITE = 1_000;
