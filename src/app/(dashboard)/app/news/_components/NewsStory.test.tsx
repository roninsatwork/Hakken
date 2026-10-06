import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { RolloutLine } from "./NewsStory";

/** The September 2026 spam update on day 13 of up to 14: the dot near the line's right end. */
const UPDATE = { startedOn: "2026-09-24", finishedOn: null, expectedDays: 14 };
const TODAY = "2026-10-06";

/**
 * jsdom lays nothing out, so the test says how wide the line and its words
 * are, as a browser would measure them, and reports each watched element once
 * as a browser's ResizeObserver does when it starts watching.
 */
function layOut(lineWidth: number) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("h-[52px]") ? lineWidth : 0;
  });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
    const words = this.textContent ?? "";
    if (words.startsWith("Started")) return 90;
    if (words.startsWith("Today")) return 76;
    if (words.startsWith("Done by")) return 140;
    return 0;
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      report: () => void;
      constructor(report: () => void) {
        this.report = report;
      }
      observe() {
        this.report();
      }
      disconnect() {}
    },
  );
}

const middleWords = () => screen.getByText(/^Today/).closest("span.absolute") as HTMLElement;

describe("A rollout line's words", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps today's words out of sight until the line has been measured", () => {
    render(<RolloutLine update={UPDATE} today={TODAY} />);
    expect(middleWords()).toHaveClass("invisible");
  });

  it("moves today's words in from the end they would run into", () => {
    // 530px: under the dot (70% along) the words would overlap "Done by 8 Oct at the latest".
    layOut(530);
    render(<RolloutLine update={UPDATE} today={TODAY} />);
    expect(middleWords()).not.toHaveClass("invisible");
    // The line's width less the end words, the gap and half the middle words: 530 - 140 - 12 - 38.
    expect(middleWords().style.left).toBe("340px");
  });

  it("puts today's words under the dot when there is room", () => {
    layOut(1000);
    render(<RolloutLine update={UPDATE} today={TODAY} />);
    expect(middleWords().style.left).toBe("700px");
  });

  it("leaves today's words out when the line is too narrow for all three, the words beneath saying the day", () => {
    layOut(280);
    render(<RolloutLine update={UPDATE} today={TODAY} />);
    expect(middleWords()).toHaveClass("invisible");
    expect(screen.getByText(/Still rolling out · day 13 of up to 14/)).toBeInTheDocument();
  });
});
