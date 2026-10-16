import { normalisePage, type AutoCertainty } from "./pageClassification";

/**
 * What Auto Classify's parts share (docs/plans/active/auto-classify-plan.md):
 * where a page's answer is kept, the groups' stamp an answer was asked under,
 * how sure answers are written down, and the labels the Decision offers.
 * Plain functions, so the run, the screens' reads and the tests agree.
 */

/** The Decision Auto Classify asks of each page (decisionRegistry.ts). */
export const AUTO_CLASSIFY_DECISION = "site.page-group";

/** The records a website's answers are spread over (`pageClassificationAuto`): 10,000 pages at about 300 a record. */
export const AUTO_BUCKETS = 32;

/** The groups offered in one ask: the default limit of groups a website may have (auto-classify-plan.md, Limits). */
export const GROUPS_OFFERED = 25;

/** The Decision's labels for the groups offered, in the order given: group-a to group-y. */
export const GROUP_LABELS: readonly string[] = Array.from({ length: GROUPS_OFFERED }, (_, index) => `group-${String.fromCharCode(97 + index)}`);

/** A description's most characters: two or three sentences (auto-classify-plan.md, Limits). */
export const DESCRIPTION_LENGTH = 400;

/** FNV-1a over a string, as an unsigned 32-bit number: quick, stable, and the same everywhere. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Which record keeps a page's answer: by its address as classifications compare it. */
export function autoBucketOf(page: string): number {
  return fnv1a(normalisePage(page)) % AUTO_BUCKETS;
}

/**
 * The groups as Auto Classify saw them when it asked (AC5): their ids,
 * names, types and descriptions, in a stable order. A page asked under
 * another stamp is asked again; one asked under this one is not.
 */
export function groupsStamp(groups: readonly { _id: string; name: string; type: string; description?: string }[]): string {
  const text = [...groups]
    .sort((left, right) => left._id.localeCompare(right._id))
    .map((group) => [group._id, group.name, group.type, group.description ?? ""].join("\u0001"))
    .join("\u0002");
  return fnv1a(text).toString(36);
}

/** How sure, as each page's answer keeps it: one letter. */
export type AutoLetter = "S" | "F" | "N";
export type AutoBand = AutoCertainty | "NOT_SURE";

export function letterOf(band: AutoBand): AutoLetter {
  return band === "SURE" ? "S" : band === "FAIRLY_SURE" ? "F" : "N";
}

export function bandOf(letter: string): AutoBand {
  return letter === "S" ? "SURE" : letter === "F" ? "FAIRLY_SURE" : "NOT_SURE";
}

/** One page's answer as a record keeps it. */
export type AutoAnswer<Id extends string = string> = { page: string; classificationId: Id | null; band: AutoBand; stamp: string };

/** A record's answers, one a page. */
export function answersOf<Id extends string>(record: { pages: readonly string[]; groups: readonly (Id | null)[]; certainty: string; stamps: readonly string[] }): AutoAnswer<Id>[] {
  return record.pages.map((page, index) => ({
    page,
    classificationId: record.groups[index] ?? null,
    band: bandOf(record.certainty[index] ?? "N"),
    stamp: record.stamps[index] ?? "",
  }));
}

/** A record's answers written back: the record's parallel lists. */
export function recordOf<Id extends string>(answers: readonly AutoAnswer<Id>[]) {
  return {
    pages: answers.map((answer) => answer.page),
    groups: answers.map((answer) => answer.classificationId),
    certainty: answers.map((answer) => letterOf(answer.band)).join(""),
    stamps: answers.map((answer) => answer.stamp),
  };
}

/** The answers the shared rule applies: a group given, sure or fairly sure (AC4). */
export function appliedAnswers<Id extends string>(answers: readonly AutoAnswer<Id>[]): Array<{ page: string; classificationId: Id; certainty: AutoCertainty }> {
  return answers.flatMap((answer) =>
    answer.classificationId !== null && answer.band !== "NOT_SURE"
      ? [{ page: answer.page, classificationId: answer.classificationId, certainty: answer.band }]
      : []);
}

/** The writing model's reply as a description: one paragraph, within its length, ending on a whole sentence where it can. */
export function tidyDescription(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim().replace(/^["'“‘]+|["'”’]+$/g, "").trim();
  if (flat.length <= DESCRIPTION_LENGTH) return flat;
  const cut = flat.slice(0, DESCRIPTION_LENGTH);
  const end = cut.lastIndexOf(". ");
  return end > DESCRIPTION_LENGTH / 2 ? cut.slice(0, end + 1) : cut.trimEnd();
}
