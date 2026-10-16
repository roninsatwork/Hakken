import { describe, expect, test } from "vitest";
import {
  AUTO_BUCKETS,
  DESCRIPTION_LENGTH,
  GROUP_LABELS,
  GROUPS_OFFERED,
  answersOf,
  appliedAnswers,
  autoBucketOf,
  groupsStamp,
  recordOf,
  tidyDescription,
  type AutoAnswer,
} from "./autoClassify";

/**
 * What Auto Classify's parts share (docs/plans/active/auto-classify-plan.md):
 * a page's record, the groups' stamp, how answers are kept, the labels
 * offered, and a description as it is kept.
 */
describe("Auto Classify's shared rules", () => {
  test("a page's answer always lives in the same record, however its address is written", () => {
    const bucket = autoBucketOf("/hinges.html");
    expect(bucket).toBeGreaterThanOrEqual(0);
    expect(bucket).toBeLessThan(AUTO_BUCKETS);
    expect(autoBucketOf("https://www.morehandles.co.uk/Hinges.html?ref=x#top")).toBe(bucket);
    // Spread over the records rather than piled in one.
    const used = new Set(Array.from({ length: 500 }, (_, index) => autoBucketOf(`/product-${index}.html`)));
    expect(used.size).toBe(AUTO_BUCKETS);
  });

  test("the stamp changes when a group is added, renamed, retyped or described, and not with the order they come in", () => {
    const hinges = { _id: "g1", name: "Hinges", type: "PRODUCT", description: "Pages for hinges." };
    const locks = { _id: "g2", name: "Locks", type: "PRODUCT" };
    const stamp = groupsStamp([hinges, locks]);
    expect(groupsStamp([locks, hinges])).toBe(stamp);
    expect(groupsStamp([{ ...hinges, name: "Door hinges" }, locks])).not.toBe(stamp);
    expect(groupsStamp([{ ...hinges, type: "OTHER" }, locks])).not.toBe(stamp);
    expect(groupsStamp([{ ...hinges, description: "Hinges and packs." }, locks])).not.toBe(stamp);
    expect(groupsStamp([hinges, locks, { _id: "g3", name: "Blog", type: "INFORMATIONAL" }])).not.toBe(stamp);
  });

  test("answers are kept and read back exactly, and only a group given sure or fairly sure is applied", () => {
    const answers: AutoAnswer[] = [
      { page: "/hinges.html", classificationId: "g1", band: "SURE", stamp: "a" },
      { page: "/scandi-pull-handle.html", classificationId: "g2", band: "FAIRLY_SURE", stamp: "a" },
      { page: "/discounts", classificationId: null, band: "SURE", stamp: "a" },
      { page: "/odd.html", classificationId: "g1", band: "NOT_SURE", stamp: "a" },
    ];
    const record = recordOf(answers);
    expect(record.certainty).toBe("SFSN");
    expect(answersOf(record)).toEqual(answers);
    expect(appliedAnswers(answers)).toEqual([
      { page: "/hinges.html", classificationId: "g1", certainty: "SURE" },
      { page: "/scandi-pull-handle.html", classificationId: "g2", certainty: "FAIRLY_SURE" },
    ]);
  });

  test("the Decision offers a label for each of the 25 groups", () => {
    expect(GROUP_LABELS).toHaveLength(GROUPS_OFFERED);
    expect(GROUP_LABELS[0]).toBe("group-a");
    expect(GROUP_LABELS.at(-1)).toBe("group-y");
  });

  test("a description is one paragraph within its length, without the quotes a model may put round it", () => {
    expect(tidyDescription('  "Pages for hinges.\n\nNot locks."  ')).toBe("Pages for hinges. Not locks.");
    const long = `${"Pages for hinges and hinge packs of every kind. ".repeat(12)}`;
    const tidy = tidyDescription(long);
    expect(tidy.length).toBeLessThanOrEqual(DESCRIPTION_LENGTH);
    expect(tidy.endsWith(".")).toBe(true);
  });
});
