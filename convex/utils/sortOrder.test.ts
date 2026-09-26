import { describe, expect, test } from "vitest";
import { byValue, compareSortValues, ipSortKey } from "./sortOrder";

type Row = { name: string; value: number | string | null };
const rows = (...values: Array<[string, number | string | null]>): Row[] => values.map(([name, value]) => ({ name, value }));
const sorted = (list: Row[], direction: "asc" | "desc") =>
  [...list].sort(byValue((row) => row.value, (row) => row.name, direction)).map((row) => row.name);

/**
 * The one rule every Sites table sorts by, on the server and in the browser
 * alike (docs/plans/active/sites-table-sorting-plan.md).
 */
describe("the Sites sorting rule", () => {
  test("numbers by size either way round, blanks last both ways", () => {
    const list = rows(["b", 10], ["blank", null], ["a", 2], ["c", 300]);
    expect(sorted(list, "desc")).toEqual(["c", "b", "a", "blank"]);
    expect(sorted(list, "asc")).toEqual(["a", "b", "c", "blank"]);
  });

  test("ties settled by the name, so equal values keep one order", () => {
    const list = rows(["ronins agency", 1], ["ai agency", 1], ["ronins", 1]);
    expect(sorted(list, "asc")).toEqual(["ai agency", "ronins", "ronins agency"]);
    expect(sorted(list, "desc")).toEqual(["ai agency", "ronins", "ronins agency"]);
  });

  test("days by age and names A to Z", () => {
    expect(sorted(rows(["old", "2026-08-30"], ["new", "2026-09-26"], ["mid", "2026-09-03"], ["none", ""]), "desc")).toEqual(["new", "mid", "old", "none"]);
    expect(sorted(rows(["x", "web design surrey"], ["y", "Ai agency"], ["z", "carp rigs"]), "asc")).toEqual(["y", "z", "x"]);
  });

  test("NaN is a blank, and two blanks tie", () => {
    expect(compareSortValues(Number.NaN, 3, "desc")).toBeGreaterThan(0);
    expect(compareSortValues(undefined, null, "asc")).toBe(0);
    expect(compareSortValues(4, 4, "asc")).toBe(0);
  });

  test("addresses in number order, the others after them", () => {
    const addresses = ["10.0.0.1", "9.1.2.3", "2001:db8::1", "192.168.0.2", "192.168.0.10"];
    expect([...addresses].sort((left, right) => ipSortKey(left).localeCompare(ipSortKey(right)))).toEqual([
      "9.1.2.3", "10.0.0.1", "192.168.0.2", "192.168.0.10", "2001:db8::1",
    ]);
  });
});
