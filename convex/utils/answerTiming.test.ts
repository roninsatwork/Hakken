import { describe, expect, it, vi } from "vitest";
import { answerTiming, answerTimingLine } from "./answerTiming";

describe("where an answer's time goes", () => {
  it("counts each step from the moment the question was saved, in step order", () => {
    expect(answerTimingLine("t1", 1_000, { run: 1_900, firstWorker: 1_300, done: 9_000 })).toEqual({
      threadId: "t1",
      firstWorker: 300,
      run: 900,
      done: 8_000,
    });
  });

  it("keeps a step the first time it is reached, so a second ask of the model does not move it", () => {
    let clock = 1_000;
    const timing = answerTiming({ receivedAt: 1_000 }, () => clock);
    clock = 2_000;
    timing.mark("modelStarted");
    clock = 5_000;
    timing.mark("modelStarted");

    expect(timing.carry().at).toEqual({ modelStarted: 2_000 });
  });

  it("carries the first worker's steps to the second, and writes them all on one line", () => {
    let clock = 1_400;
    const first = answerTiming({ receivedAt: 1_000 }, () => clock);
    first.mark("firstWorker");
    clock = 1_600;
    first.mark("handedOn");

    clock = 2_500;
    const second = answerTiming(first.carry(), () => clock);
    second.mark("run");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    second.log("t1");

    expect(log).toHaveBeenCalledWith(
      `Answer timing ${JSON.stringify({ threadId: "t1", firstWorker: 400, handedOn: 600, run: 1_500 })}`,
    );
    log.mockRestore();
  });
});
