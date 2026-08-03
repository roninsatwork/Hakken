import { describe, expect, test } from "vitest";

import {
  MAX_ITEM_ATTEMPTS,
  decideItemRetry,
  decideJobEnding,
  describeProgress,
  isQueueDrained,
  kindForPhase,
  nextPhase,
  phaseForKind,
  shouldStopForJobBudget,
  tallyItems,
  type ResearchJobItemStatus,
} from "./salesDataResearchJobService";

const items = (...statuses: ResearchJobItemStatus[]) => statuses.map((status) => ({ status }));

describe("phase order", () => {
  /**
   * The order is the reason this is one job. A prospect's details cannot be
   * researched before the chain pass has found the prospect, so the third pass
   * cannot be a separate button somebody presses afterwards.
   */
  test("runs customers, then chains, then the prospects the chains produced", () => {
    expect(nextPhase("CUSTOMERS")).toBe("CHAINS");
    expect(nextPhase("CHAINS")).toBe("PROSPECTS");
    expect(nextPhase("PROSPECTS")).toBe("DONE");
    expect(nextPhase("DONE")).toBe("DONE");
  });

  test("maps each phase to the work it hands out, and back", () => {
    expect(kindForPhase("CUSTOMERS")).toBe("CUSTOMER");
    expect(kindForPhase("CHAINS")).toBe("CHAIN");
    expect(kindForPhase("PROSPECTS")).toBe("PROSPECT");
    expect(kindForPhase("DONE")).toBeNull();

    expect(phaseForKind("CUSTOMER")).toBe("CUSTOMERS");
    expect(phaseForKind("CHAIN")).toBe("CHAINS");
    expect(phaseForKind("PROSPECT")).toBe("PROSPECTS");
  });
});

describe("giving up on one item", () => {
  /**
   * The first failure is usually a run meeting one of its own ceilings, which
   * the next run will not. A second failure at the same item is deterministic,
   * and a third attempt buys nothing but the bill.
   */
  test("retries once, then records it as undone", () => {
    expect(decideItemRetry(0)).toBe("RETRY");
    expect(decideItemRetry(1)).toBe("RETRY");
    expect(decideItemRetry(MAX_ITEM_ATTEMPTS)).toBe("GIVE_UP");
    expect(decideItemRetry(MAX_ITEM_ATTEMPTS + 1)).toBe("GIVE_UP");
  });
});

describe("knowing when it is finished", () => {
  test("is not drained while anything is queued or in flight", () => {
    expect(isQueueDrained(tallyItems(items("PENDING", "DONE")))).toBe(false);
    expect(isQueueDrained(tallyItems(items("IN_PROGRESS", "DONE")))).toBe(false);
    expect(isQueueDrained(tallyItems(items("DONE", "FAILED")))).toBe(true);
  });

  /**
   * "Finished" and "finished apart from these four" are different things to be
   * told, and the difference is the entire reason exceptions are recorded.
   */
  test("separates a clean finish from one with exceptions", () => {
    expect(decideJobEnding(tallyItems(items("DONE", "DONE")))).toBe("COMPLETE");
    expect(decideJobEnding(tallyItems(items("DONE", "FAILED")))).toBe(
      "COMPLETE_WITH_EXCEPTIONS"
    );
  });
});

describe("the job's own spend ceiling", () => {
  /**
   * Per-run ceilings stop one run going mad. Only this stops a job costing fifty
   * pounds by starting twenty runs that each stayed politely under theirs.
   */
  test("stops once the job has spent what it was allowed", () => {
    expect(shouldStopForJobBudget({ spentGBP: 4.9, maxCostGBP: 25 })).toBe(false);
    expect(shouldStopForJobBudget({ spentGBP: 25, maxCostGBP: 25 })).toBe(true);
    expect(shouldStopForJobBudget({ spentGBP: 30.2, maxCostGBP: 25 })).toBe(true);
  });
});

describe("what the screen says while it works", () => {
  /**
   * A count of the work, not a count of the runs. "Queued 60" told a person
   * nothing they wanted to know and hid how much was left.
   */
  test("counts the work done against the work there is", () => {
    expect(
      describeProgress({
        phase: "CUSTOMERS",
        tally: tallyItems(items("DONE", "DONE", "FAILED", "PENDING", "IN_PROGRESS")),
      })
    ).toBe("Filling in customers — 3 of 5");

    expect(
      describeProgress({ phase: "CHAINS", tally: tallyItems(items("PENDING", "PENDING")) })
    ).toBe("Looking through chains — 0 of 2");

    expect(describeProgress({ phase: "DONE", tally: tallyItems(items("DONE")) })).toBe(
      "Finishing up"
    );
  });
});
