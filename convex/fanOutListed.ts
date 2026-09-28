import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { holdQuestion } from "./holdLists";
import { angleOf } from "./utils/fanOutAngle";

/**
 * Whether a fan-out query is on any of a website's lists: one of its asked
 * prompts' — the AI's, not deleted from that prompt, or the company's own
 * (docs/plans/active/fan-out-opt-in-plan.md). The same query under two prompts
 * is one search for the website. A prompt removed lists nothing, even while
 * its topics wait for the next rebuild to clear them.
 *
 * Its own module so the fan-out screen's changes (`promptFanOut.ts`) and the
 * planner's first checks (`fanOutFirstCheckSteps.ts`) ask it the same way.
 */

type Reader = { db: QueryCtx["db"] };

/** A website's choices read, at most: one with more is judged on the first. */
const CHOICES_READ = 1_000;

/** Topic rows read for one query: one per prompt that ran words like it. */
const ANGLES_READ = 1_000;

/**
 * A checker for one website: the website's choices, and which prompts it
 * still asks, are read once however many queries it is asked about.
 */
export function listedChecker(ctx: Reader, holdId: Id<"companyWebsites">): (query: string) => Promise<boolean> {
  let choices: Promise<Doc<"fanOutQueryChoices">[]> | null = null;
  const asked = new Map<string, Promise<boolean>>();
  const isAsked = (prompt: string) => {
    let known = asked.get(prompt);
    if (!known) {
      known = holdQuestion(ctx, holdId, prompt).then((question) => question !== null);
      asked.set(prompt, known);
    }
    return known;
  };
  return async (query) => {
    choices ??= ctx.db.query("fanOutQueryChoices").withIndex("by_hold_prompt", (q) => q.eq("holdId", holdId)).take(CHOICES_READ);
    const [angles, all] = await Promise.all([
      ctx.db
        .query("fanOutAngles")
        .withIndex("by_hold_angle", (q) => q.eq("holdId", holdId).eq("angle", angleOf(query)))
        .take(ANGLES_READ),
      choices,
    ]);
    const chosen = new Map(all.filter((choice) => choice.query === query).map((choice) => [choice.prompt, choice]));
    for (const angle of angles) {
      if (chosen.get(angle.prompt)?.removed || !angle.wordings.some((wording) => wording.query === query)) continue;
      if (await isAsked(angle.prompt)) return true;
    }
    for (const choice of chosen.values()) {
      if (choice.own && !choice.removed && await isAsked(choice.prompt)) return true;
    }
    return false;
  };
}
