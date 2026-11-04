import { describe, expect, test, vi } from "vitest";
import { readListInParts } from "./readListInParts";

/** A list of `total` rows answered `size` at a time, as `analyticsListAll` answers. */
const listOf = (total: number, size: number) => {
  const rows = Array.from({ length: total }, (_, index) => index);
  return vi.fn(async (part: number) => ({ rows: rows.slice(part * size, (part + 1) * size), total }));
};

describe("reading a list for its download", () => {
  test("every row once, in order, however many parts it takes", async () => {
    const read = listOf(13_803, 4_000);
    const rows = await readListInParts(read);
    expect(rows).toEqual(Array.from({ length: 13_803 }, (_, index) => index));
    expect(read.mock.calls.map(([part]) => part)).toEqual([0, 1, 2, 3]);
  });

  test("a short list and an empty one take one read", async () => {
    const short = listOf(3, 4_000);
    expect(await readListInParts(short)).toEqual([0, 1, 2]);
    expect(short).toHaveBeenCalledTimes(1);
    const empty = listOf(0, 4_000);
    expect(await readListInParts(empty)).toEqual([]);
    expect(empty).toHaveBeenCalledTimes(1);
  });

  test("a list exactly as long as its parts stops at the last one", async () => {
    const read = listOf(8_000, 4_000);
    expect(await readListInParts(read)).toHaveLength(8_000);
    expect(read).toHaveBeenCalledTimes(2);
  });

  test("a read that runs over is asked for again, and the file still has every row", async () => {
    const list = listOf(5, 2);
    const read = vi.fn(list);
    read.mockImplementationOnce(list).mockRejectedValueOnce(new Error("Function execution timed out"));
    expect(await readListInParts(read)).toEqual([0, 1, 2, 3, 4]);
  });

  test("a part that fails twice stops the download, so a file is never short of rows", async () => {
    const list = listOf(5, 2);
    const read = vi.fn(list);
    read.mockImplementationOnce(list).mockRejectedValueOnce(new Error("no")).mockRejectedValueOnce(new Error("no"));
    await expect(readListInParts(read)).rejects.toThrow("no");
  });

  test("a list that changes during the reading is read again from the start", async () => {
    const before = listOf(5, 2);
    const after = listOf(6, 2);
    const read = vi.fn(after);
    read.mockImplementationOnce(before);
    expect(await readListInParts(read)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test("a list that never stops changing ends in a failure, never a hang or a short file", async () => {
    let total = 4;
    const read = vi.fn(async (part: number) => ({ rows: [part], total: (total += 1) }));
    await expect(readListInParts(read)).rejects.toThrow("kept changing");
    expect(read).toHaveBeenCalledTimes(6);
  });

  test("a part with no rows while the list says there are more ends the same way", async () => {
    const read = vi.fn(async (part: number) => ({ rows: part === 0 ? [1] : [], total: 3 }));
    await expect(readListInParts(read)).rejects.toThrow("kept changing");
  });
});
