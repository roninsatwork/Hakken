import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./Button";

/**
 * The two promises worth testing are the ones a raw <button> breaks: a bare
 * button inside a form silently submits it, and a disabled control that still
 * fires is worse than no control. The variants themselves are frozen recipes,
 * so the variant test only pins that each renders its own classes and that a
 * caller's className wins the merge — the look is checked by eye, not here.
 */

describe("Button", () => {
  it("defaults to type button, never the silent form submit", () => {
    render(<Button variant="primary">Save</Button>);

    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "button");
  });

  it("keeps an explicit submit type when a form wants one", () => {
    render(
      <Button variant="primary" type="submit">
        Save
      </Button>
    );

    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "submit");
  });

  it("renders each variant with its own recipe", () => {
    const { rerender } = render(<Button variant="primary">Go</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-foreground", "text-background");

    rerender(<Button variant="pill">Go</Button>);
    expect(screen.getByRole("button")).toHaveClass("rounded-full", "font-bold");

    rerender(<Button variant="quiet">Go</Button>);
    expect(screen.getByRole("button")).toHaveClass("border-border-dim", "text-secondary");

    rerender(<Button variant="ghost">Go</Button>);
    expect(screen.getByRole("button")).toHaveClass("hover:bg-white/5", "text-secondary");

    rerender(<Button variant="accent">Go</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-brand/10", "text-brand");

    rerender(<Button variant="destructive">Go</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-red-500/10", "text-red-500");

    rerender(<Button variant="icon" aria-label="Close" />);
    expect(screen.getByRole("button")).toHaveClass("p-2", "rounded-full");
  });

  it("always shows keyboard focus", () => {
    render(<Button variant="ghost">Go</Button>);

    expect(screen.getByRole("button")).toHaveClass("focus-visible:outline-2");
  });

  it("lets a caller's className win the merge", () => {
    render(
      <Button variant="quiet" className="text-[11px]">
        Go
      </Button>
    );

    const button = screen.getByRole("button");
    expect(button).toHaveClass("text-[11px]");
    expect(button).not.toHaveClass("text-[12px]");
  });

  it("fires onClick", () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" onClick={onClick}>
        Go
      </Button>
    );

    fireEvent.click(screen.getByRole("button", { name: "Go" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("blocks onClick while disabled", () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" onClick={onClick} disabled>
        Go
      </Button>
    );

    fireEvent.click(screen.getByRole("button", { name: "Go" }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("forwards native button props", () => {
    render(
      <Button variant="ghost" aria-label="Dismiss" title="Dismiss" form="theForm">
        ×
      </Button>
    );

    const button = screen.getByRole("button", { name: "Dismiss" });
    expect(button).toHaveAttribute("title", "Dismiss");
    expect(button).toHaveAttribute("form", "theForm");
  });
});
