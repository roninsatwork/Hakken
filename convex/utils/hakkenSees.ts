import { v } from "convex/values";

/**
 * What Hakken sees (docs/plans/active/discovery-detail-and-hakken-sees-plan.md
 * §2 and §6): the box under the title of every Discovery screen, saying what
 * the page means for the business and what to do first. Written by fixed
 * rules over the rows the page's own query already reads — never an AI model,
 * never a purchase (DS5) — and sent as codes with their numbers, so the words
 * are the screen's, in the reader's language (`sites.seen.<screen>`).
 */

/** One sentence: its code, the numbers it fills in, and a name it quotes (a business, a question, a page). */
export const seenPhraseValidator = v.object({
  code: v.string(),
  a: v.optional(v.number()),
  b: v.optional(v.number()),
  c: v.optional(v.number()),
  text: v.optional(v.string()),
  more: v.optional(v.string()),
  /** An AI engine's id ("chatgpt"), named on screen in the reader's language. */
  engine: v.optional(v.string()),
});

/**
 * Where a step's link leads: a record of the site's (`record` with its `key`),
 * one of its pages narrowed by filters (`segment`, `filters`), or a page
 * elsewhere (`url`). The screen turns it into an address with the way back.
 */
export const seenTargetValidator = v.object({
  record: v.optional(v.string()),
  key: v.optional(v.string()),
  segment: v.optional(v.string()),
  filters: v.optional(v.record(v.string(), v.string())),
  url: v.optional(v.string()),
});

/** One "Do first" step: its sentence, the words of its link (`sites.seen.links`), and where the link leads. */
export const seenStepValidator = v.object({
  code: v.string(),
  a: v.optional(v.number()),
  b: v.optional(v.number()),
  c: v.optional(v.number()),
  text: v.optional(v.string()),
  more: v.optional(v.string()),
  engine: v.optional(v.string()),
  link: v.string(),
  to: seenTargetValidator,
});

export const seenValidator = v.object({
  says: v.array(seenPhraseValidator),
  steps: v.array(seenStepValidator),
});

export type SeenPhrase = typeof seenPhraseValidator.type;
export type SeenTarget = typeof seenTargetValidator.type;
export type SeenStep = typeof seenStepValidator.type;
export type Seen = typeof seenValidator.type;

/** Two or three sentences, sixty words at most (§2). */
export const MOST_SAYS = 3;
/** One to three steps. */
export const MOST_STEPS = 3;

type Maybe<T> = T | null | undefined | false;

/**
 * A box from a screen's rules, each list most important first: the rules
 * offer what applies (a rule that does not, offers nothing) and the box keeps
 * the first three of each.
 */
export function seen(says: ReadonlyArray<Maybe<SeenPhrase>>, steps: ReadonlyArray<Maybe<SeenStep>> = []): Seen {
  return {
    says: says.filter((phrase): phrase is SeenPhrase => Boolean(phrase)).slice(0, MOST_SAYS),
    steps: steps.filter((step): step is SeenStep => Boolean(step)).slice(0, MOST_STEPS),
  };
}

/** A step to one of the site's records. */
export function toRecord(record: string, key: string): SeenTarget {
  return { record, key };
}

/** A step to one of the site's pages, narrowed by its filters. */
export function toPage(segment: string, filters?: Record<string, string>): SeenTarget {
  return filters ? { segment, filters } : { segment };
}

/**
 * A query's handler whose result carries its box: `rule` worked out over the
 * result the handler already returns, so the box costs no read of its own.
 * Wraps the handler as written, early returns and all.
 */
export function seeing<Ctx, Args, Result extends object>(handler: (ctx: Ctx, args: Args) => Promise<Result>, rule: (result: Result) => Seen) {
  return async (ctx: Ctx, args: Args): Promise<Result & { seen: Seen }> => {
    const result = await handler(ctx, args);
    return { ...result, seen: rule(result) };
  };
}
