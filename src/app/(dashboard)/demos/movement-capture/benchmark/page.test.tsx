import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DenseBenchmarkCapturePage from "./page";

vi.mock("@/src/ui/components/layout/Header", () => ({
  default: () => <header>Header</header>,
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("react-webcam", () => ({
  default: React.forwardRef(function WebcamMock() {
    return <div data-testid="benchmark-webcam">Camera preview</div>;
  }),
}));

describe("DenseBenchmarkCapturePage", () => {
  it("keeps all six local recording controls disabled until explicit consent", () => {
    render(<DenseBenchmarkCapturePage />);

    expect(screen.getByText("Private dense-model benchmark capture")).toBeInTheDocument();
    expect(screen.getByText("Captured 0/6")).toBeInTheDocument();
    expect(screen.getByTestId("benchmark-webcam")).toBeInTheDocument();
    const recordButtons = screen.getAllByRole("button", { name: "Record clip" });
    expect(recordButtons).toHaveLength(6);
    recordButtons.forEach((button) => expect(button).toBeDisabled());

    fireEvent.click(screen.getByRole("checkbox"));

    recordButtons.forEach((button) => expect(button).toBeEnabled());
  });

  it("states the local-only privacy boundary and required handoff folder", () => {
    render(<DenseBenchmarkCapturePage />);

    expect(screen.getByText(/Nothing on this page uploads raw RGB video to Convex/)).toBeInTheDocument();
    expect(screen.getByText("tmp/movement-replay-lab/dense-capture/clips")).toBeInTheDocument();
  });
});
