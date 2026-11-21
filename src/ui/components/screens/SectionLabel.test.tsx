import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionLabel } from "./SectionLabel";

/** The heading over one part of a screen with no card round it, in a settings card's own title words. */
describe("SectionLabel", () => {
  it("is a real heading, level 2 unless asked for 3", () => {
    render(
      <>
        <SectionLabel>Tags</SectionLabel>
        <SectionLabel as="h3" id="related">
          Related pages
        </SectionLabel>
      </>,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Tags" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Related pages" })).toHaveAttribute("id", "related");
  });

  it("wears the settings card title's words at 13px", () => {
    render(<SectionLabel className="mb-2">Pinned by staff</SectionLabel>);

    const heading = screen.getByRole("heading", { name: "Pinned by staff" });
    expect(heading).toHaveClass("text-[13px]", "uppercase", "text-muted", "mb-2");
  });
});
