import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CodeBoxes } from "./CodeBoxes";

function Harness({ invalid = false }: { invalid?: boolean }) {
  const [code, setCode] = useState("");
  return (
    <>
      <CodeBoxes label="Six-digit code" value={code} onChange={setCode} invalid={invalid} />
      <output data-testid="code">{code}</output>
    </>
  );
}

const box = (n: number) => screen.getByLabelText(`Digit ${n}`) as HTMLInputElement;

describe("CodeBoxes", () => {
  it("fills one box a digit and moves on by itself", () => {
    render(<Harness />);
    fireEvent.change(box(1), { target: { value: "4" } });
    expect(document.activeElement).toBe(box(2));
    fireEvent.change(box(2), { target: { value: "8" } });
    expect(screen.getByTestId("code")).toHaveTextContent("48");
    expect(box(1).value).toBe("4");
    expect(box(2).value).toBe("8");
    expect(box(3).value).toBe("");
  });

  it("a pasted or auto-filled code fills every box, spaces and all", () => {
    render(<Harness />);
    fireEvent.paste(box(1), { clipboardData: { getData: () => "482 913" } });
    expect(screen.getByTestId("code")).toHaveTextContent("482913");
    expect([1, 2, 3, 4, 5, 6].map((n) => box(n).value)).toEqual(["4", "8", "2", "9", "1", "3"]);
  });

  it("backspace in an empty box steps back and clears the one before", () => {
    render(<Harness />);
    fireEvent.paste(box(1), { clipboardData: { getData: () => "48" } });
    box(3).focus();
    fireEvent.keyDown(box(3), { key: "Backspace" });
    expect(screen.getByTestId("code")).toHaveTextContent("4");
    expect(document.activeElement).toBe(box(2));
  });

  it("keeps only digits, six at most", () => {
    render(<Harness />);
    fireEvent.paste(box(1), { clipboardData: { getData: () => "ab12-34-5678" } });
    expect(screen.getByTestId("code")).toHaveTextContent("123456");
  });

  it("outlines the next box to fill, or every box when the code was refused", () => {
    const { rerender } = render(<Harness />);
    expect(box(1).className).toContain("border-brand/50");
    expect(box(2).className).toContain("border-border-dim");
    rerender(<Harness invalid />);
    expect(box(1).className).toContain("border-destructive");
  });
});
