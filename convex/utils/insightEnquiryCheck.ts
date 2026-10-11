import { v, type Infer } from "convex/values";
import type { Fact } from "./insightFacts";

/**
 * The enquiry check (docs/plans/active/insights-analyst-plan.md I42): before
 * any finding about enquiries goes out, does each real enquiry count once?
 * Three signs it doesn't, each from figures Hakken already reads — and the
 * Google Analytics work found the third on a client's website: 255 of the 271
 * people who clicked a link to another website "sent a form after it".
 *
 * - Two ways of counting rise and fall together: one enquiry counted twice.
 * - People send it again and again: repeats, or something doing it for them.
 * - Nearly everyone who leaves by a link goes on to enquire: the form counts
 *   as leaving the website, or bots fill it in.
 *
 * Small numbers say nothing either way. The result goes with the week; the
 * specialists are told, so a finding about enquiries says what is uncertain.
 */

export const enquiryProblemValidator = v.object({
  code: v.union(v.literal("countedTwice"), v.literal("repeated"), v.literal("leavesBefore")),
  event: v.string(),
  other: v.union(v.string(), v.null()),
  a: v.number(),
  b: v.number(),
});
export const enquiryCheckValidator = v.object({ ok: v.boolean(), problems: v.array(enquiryProblemValidator) });
export type EnquiryCheck = Infer<typeof enquiryCheckValidator>;

/** Fewer than this, and a count says nothing either way. */
const FEW = 20;

export function enquiryCheck(facts: readonly Fact[]): EnquiryCheck {
  const at = new Map(facts.map((fact) => [fact.key, fact.value]));
  const counted = facts
    .map((fact) => /^ga\.counted\.(.+)\.times\.365\.now$/.exec(fact.key)?.[1])
    .filter((event): event is string => Boolean(event))
    .map((event) => ({ event, times: at.get(`ga.counted.${event}.times.365.now`) ?? 0, people: at.get(`ga.event.${event}.people.365.now`) ?? 0 }))
    .filter((event) => event.times >= FEW);
  const problems: EnquiryCheck["problems"] = [];
  // Two ways of counting within a tenth of each other: the same enquiry, twice.
  for (let first = 0; first < counted.length; first += 1) {
    for (let second = first + 1; second < counted.length; second += 1) {
      const [a, b] = [counted[first], counted[second]];
      if (Math.abs(a.times - b.times) <= Math.max(a.times, b.times) * 0.1) problems.push({ code: "countedTwice", event: a.event, other: b.event, a: a.times, b: b.times });
    }
  }
  // One and a half times or more for each person who sent it.
  for (const event of counted) {
    if (event.people > 0 && event.times >= event.people * 1.5) problems.push({ code: "repeated", event: event.event, other: null, a: event.times, b: event.people });
  }
  // Four in five or more of the people who left by a link went on to enquire.
  const did = at.get("ga.funnel.click.did.365.now"), then = at.get("ga.funnel.click.then.365.now");
  if (did !== undefined && then !== undefined && did >= FEW && then >= did * 0.8) problems.push({ code: "leavesBefore", event: "click", other: null, a: then, b: did });
  return { ok: problems.length === 0, problems };
}

/** The check in words for the specialists' brief: English, as their findings are written. */
export function enquiryCheckBrief(check: EnquiryCheck): string | null {
  if (check.ok) return null;
  const said = check.problems.map((problem) => {
    if (problem.code === "countedTwice") return `"${problem.event}" and "${problem.other}" happened ${problem.a} and ${problem.b} times in 12 months, so one enquiry may be counted twice`;
    if (problem.code === "repeated") return `"${problem.event}" happened ${problem.a} times from ${problem.b} people in 12 months, so some are repeats or not people`;
    return `${problem.a} of the ${problem.b} people who clicked a link off the website went on to enquire, so the form may count as leaving the website, or bots may be filling it in`;
  });
  return `The enquiry count may be wrong (I42): ${said.join("; ")}. Any finding about enquiries says in one short sentence that the count is being checked, and the Measurement specialist says what to test.`;
}
