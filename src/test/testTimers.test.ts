import { describe, expect, it } from "vitest";

/**
 * No timer outlives its test (`testTimers.ts`, installed by vitest.setup.ts):
 * what one test starts and leaves running never fires in the next — as a
 * "Saved" note's two-second timer once fired after its page's window was gone
 * and failed a run whose every test had passed (CI #26, 2026-10-05).
 */
describe("a timer a test leaves running", () => {
  const fired: string[] = [];

  it("is started by one test and left", () => {
    setTimeout(() => fired.push("timeout"), 10);
    setInterval(() => fired.push("interval"), 10);
    expect(fired).toEqual([]);
  });

  it("never fires once that test has ended", async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(fired).toEqual([]);
  });

  it("while a timer the test itself waits on still fires", async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    const done = await new Promise<string>((resolve) => setTimeout(() => resolve("done"), 5));
    expect(done).toBe("done");
  });
});
