import { describe, expect, test } from "vitest";
import { decodeCopyRows, encodeCopyRows } from "./copyColumns";

/** A compact copy's part as columns, read back exactly as its rows of JSON would be (core-data plan §6.4). */
describe("a copy's part as columns", () => {
  const rows: unknown[][] = [
    ["id-1", "brass lever handles", 3, "p01_03", "/levers/", 880, "BUYING", "UP", -2, "2026-09-27", "kd31_70", 0.12999999523162842, 5.24, 41],
    ["id-2", "door knobs", null, "p04_10", "/knobs/", 0, "RESEARCHING", "SAME", 0, "2026-09-27", null, null, 0, null],
    ["id-3", "sash locks", 100, "p51_up", "/levers/", 12_100, "BUYING", "LOST", 7, "2026-09-20", "kd00_10", 1.5, null, 0],
  ];

  test("reads back exactly as its rows of JSON would — whole numbers, blanks, below 0, fractions and text", () => {
    expect(decodeCopyRows(encodeCopyRows(rows, 14))).toEqual(JSON.parse(JSON.stringify(rows)));
  });

  test("what JSON would make of nothing is what comes back", () => {
    const odd = [[undefined, Number.NaN, true, [1, 2], { a: 1 }, -0]];
    expect(decodeCopyRows(encodeCopyRows(odd, 6))).toEqual(JSON.parse(JSON.stringify(odd)));
  });

  test("text that repeats is kept once; a part kept before as rows is read as it was", () => {
    const many = Array.from({ length: 200 }, (_, at) => [at, ["BUYING", "RESEARCHING", "BRANDED"][at % 3], `/page-${at % 7}/`]);
    const columns = encodeCopyRows(many, 3);
    expect(columns.length).toBeLessThan(JSON.stringify(many).length / 3);
    expect(decodeCopyRows(columns)).toEqual(many);
    expect(decodeCopyRows(JSON.stringify(many))).toEqual(many);
  });
});
