import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MovementFrameViewer from "./MovementFrameViewer";
import { drawMovementSkeleton } from "../_lib/movementSkeleton";
import type { MovementFrame } from "../_lib/movementTypes";

vi.mock("../_lib/movementSkeleton", () => ({
  drawMovementSkeleton: vi.fn(),
}));

const makeFrame = (): MovementFrame =>
  Array.from({ length: 33 }, (_, index) => ({
    x: index / 33,
    y: index / 33,
    z: 0,
    visibility: 0.9,
  }));

describe("MovementFrameViewer", () => {
  beforeEach(() => {
    vi.mocked(drawMovementSkeleton).mockClear();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  });

  it("renders loading, empty, and error states", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <MovementFrameViewer frames={[]} isLoading error={null} onRetry={onRetry} />,
    );

    expect(screen.getByText("Preparing posture sequence...")).toBeInTheDocument();

    rerender(<MovementFrameViewer frames={[]} isLoading={false} error={null} onRetry={onRetry} />);

    expect(screen.getByText("Routine preview unavailable")).toBeInTheDocument();

    rerender(
      <MovementFrameViewer frames={[]} isLoading={false} error="Could not parse" onRetry={onRetry} />,
    );

    expect(screen.getByText("Could not parse")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("draws frames and exposes scrubber controls", () => {
    render(
      <MovementFrameViewer
        frames={[makeFrame(), makeFrame()]}
        isLoading={false}
        error={null}
        controls="scrubber"
      />,
    );

    expect(drawMovementSkeleton).toHaveBeenCalledTimes(1);
    expect(screen.getByText("0 / 2")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("slider"), { target: { value: "1" } });

    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("uses the compact button controls for modal previews", () => {
    render(
      <MovementFrameViewer
        frames={[makeFrame()]}
        isLoading={false}
        error={null}
        controls="button"
      />,
    );

    const button = screen.getByRole("button", { name: "Play Sequence" });
    expect(button).toBeEnabled();

    fireEvent.click(button);

    expect(screen.getByRole("button", { name: "Pause Visualizer" })).toBeInTheDocument();
  });
});
