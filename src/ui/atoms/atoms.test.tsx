import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Typography, { TypographyVariant } from "./typography";

describe("ui atoms", () => {
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
