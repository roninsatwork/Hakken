import { describe, expect, test } from "vitest";

import { createCoverage } from "./readCoverage";

/**
 * The whole mechanism is one row.
 *
 * A read asks for `limit + 1`, and the extra row — if it comes back — is the
 * only evidence there was more. Everything downstream, on six analytics
 * surfaces and the platform overview, rests on these few lines being right.
 */

describe("read coverage", () => {
  test("a read inside its limit is complete, and nothing is trimmed", () => {
    const coverage = createCoverage();
    const rows = coverage.cap("messages", 10, [1, 2, 3]);

    expect(rows).toEqual([1, 2, 3]);
    expect(coverage.result()).toEqual({ complete: true, incomplete: [] });
  });

  test("a read exactly at its limit is complete — the evidence row never arrived", () => {
    const coverage = createCoverage();
    const rows = coverage.cap("messages", 3, [1, 2, 3]);

    expect(rows).toHaveLength(3);
    expect(coverage.result().complete).toBe(true);
  });

  test("one row past the limit is what makes the overflow visible", () => {
    const coverage = createCoverage();
    const rows = coverage.cap("messages", 3, [1, 2, 3, 4]);

    // The evidence row is never handed on — it exists only to be counted.
    expect(rows).toEqual([1, 2, 3]);
    expect(coverage.result()).toEqual({ complete: false, incomplete: ["messages"] });
  });

  test("a capped read inside a loop reports itself once, not once per pass", () => {
    const coverage = createCoverage();
    for (let pass = 0; pass < 5; pass += 1) coverage.cap("messages", 1, [1, 2]);

    expect(coverage.result().incomplete).toEqual(["messages"]);
  });

  test("several short reads are all named, in a stable order", () => {
    const coverage = createCoverage();
    coverage.cap("users", 1, [1, 2]);
    coverage.cap("messages", 1, [1, 2]);
    coverage.cap("logins", 2, [1, 2]);

    expect(coverage.result()).toEqual({ complete: false, incomplete: ["messages", "users"] });
  });

  test("two recorders do not share what they saw", () => {
    const first = createCoverage();
    const second = createCoverage();
    first.cap("messages", 1, [1, 2]);

    expect(first.result().complete).toBe(false);
    expect(second.result().complete).toBe(true);
  });
});
