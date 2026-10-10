import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation } from "convex/react";
import { useFixedDay } from "@/src/test/realTime";
import { READ_AFTER_MS, useCountClick, useCountReading, type ReadingThing } from "./useReading";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());

const { record } = vi.hoisted(() => ({ record: vi.fn() }));

function Article({ thing }: { thing: ReadingThing | null }) {
  const endRef = useCountReading(thing);
  const countClick = useCountClick();
  return (
    <>
      <a href="https://gsqi.com/october" onClick={() => countClick({ type: "WEB", id: "article_1" })}>Read it on gsqi.com</a>
      <div ref={endRef} />
    </>
  );
}

/**
 * Reading in Insights, counted (docs/plans/active/content-people-knowledge-
 * plan.md, phase 4; Q1): a view when the article is on screen, a read after 30
 * seconds or on reaching its end — once a visit — and a click on its original.
 */
describe("counting reading on a client's screen", () => {
  let reachEnd: () => void = () => undefined;

  beforeEach(() => {
    useFixedDay();
    record.mockReset().mockResolvedValue(null);
    vi.mocked(useMutation).mockReturnValue(record as never);
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
        reachEnd = () => callback([{ isIntersecting: true }]);
      }
      observe() {}
      disconnect() {}
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const kinds = () => record.mock.calls.map(([args]) => (args as { kind: string }).kind);

  it("counts nothing until the article has loaded, then a view, and a read after 30 seconds, once", () => {
    const { rerender } = render(<Article thing={null} />);
    expect(record).not.toHaveBeenCalled();

    rerender(<Article thing={{ type: "WEB", id: "article_1" }} />);
    expect(record).toHaveBeenCalledWith({ kind: "VIEW", thing: { type: "WEB", id: "article_1" } });
    act(() => {
      vi.advanceTimersByTime(READ_AFTER_MS);
    });
    act(() => reachEnd());
    expect(kinds()).toEqual(["VIEW", "READ"]);
  });

  it("counts a read on reaching the end before 30 seconds, and a click on the original", () => {
    render(<Article thing={{ type: "STORY", id: "story_1" }} />);
    act(() => reachEnd());
    expect(record).toHaveBeenLastCalledWith({ kind: "READ", thing: { type: "STORY", id: "story_1" } });

    fireEvent.click(screen.getByRole("link", { name: "Read it on gsqi.com" }));
    expect(record).toHaveBeenLastCalledWith({ kind: "CLICK", thing: { type: "WEB", id: "article_1" } });
    act(() => {
      vi.advanceTimersByTime(READ_AFTER_MS);
    });
    expect(kinds()).toEqual(["VIEW", "READ", "CLICK"]);
  });

  it("a counting failure never reaches the reader", async () => {
    record.mockRejectedValue(new Error("offline"));
    render(<Article thing={{ type: "OURS", id: "ours_1" }} />);
    await act(async () => undefined);
    expect(screen.getByRole("link", { name: "Read it on gsqi.com" })).toBeInTheDocument();
  });
});
