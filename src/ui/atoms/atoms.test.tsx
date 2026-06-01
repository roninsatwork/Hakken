import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Input from "./input";
import Typography, { TypographyVariant } from "./typography";

describe("ui atoms", () => {
  it("associates input labels with controls and forwards native props", () => {
    const onChange = vi.fn();

    render(<Input id="email" label="Email" value="ada@example.com" onChange={onChange} className="custom-class" />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "grace@example.com" } });

    expect(screen.getByLabelText("Email")).toHaveClass("custom-class");
    expect(onChange).toHaveBeenCalled();
  });

  it("renders typography variants with expected styles and passthrough attributes", () => {
    const { rerender } = render(
      <Typography variant={TypographyVariant.H1} data-testid="copy" className="extra">
        Title
      </Typography>
    );

    expect(screen.getByTestId("copy")).toHaveTextContent("Title");
    expect(screen.getByTestId("copy")).toHaveClass("!text-[48px]");
    expect(screen.getByTestId("copy")).toHaveClass("extra");

    rerender(<Typography variant={TypographyVariant.H2}>Subtitle</Typography>);
    expect(screen.getByText("Subtitle")).toHaveClass("!text-[40px]");

    rerender(<Typography>Body copy</Typography>);
    expect(screen.getByText("Body copy")).toHaveClass("text-[16px]");
  });
});
