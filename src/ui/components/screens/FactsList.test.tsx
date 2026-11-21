import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FactsList } from "./FactsList";

/** A record's facts as a real description list: each value read with its label. */
describe("FactsList", () => {
  it("pairs each label with its value in a description list", () => {
    const { container } = render(
      <FactsList
        facts={[
          { label: "Kind", value: "Policy" },
          { label: "Verified", value: "11 Nov 2026" },
        ]}
      />,
    );

    const list = container.querySelector("dl");
    expect(list).not.toBeNull();
    const terms = within(list as HTMLElement).getAllByRole("term").map((term) => term.textContent);
    const values = within(list as HTMLElement).getAllByRole("definition").map((value) => value.textContent);
    expect(screen.getByText("Policy").previousElementSibling?.textContent).toBe("Kind");
    expect(terms).toEqual(["Kind", "Verified"]);
    expect(values).toEqual(["Policy", "11 Nov 2026"]);
  });

  it("sets how many go across, with room for a layout class", () => {
    const { container } = render(<FactsList columns={2} className="lg:grid-cols-1" facts={[{ label: "Used", value: "86 answers" }]} />);

    const list = container.querySelector("dl");
    expect(list).toHaveClass("sm:grid-cols-2");
    expect(list).toHaveClass("lg:grid-cols-1");
  });
});
