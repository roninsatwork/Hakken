import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteMark } from "./SiteMark";

/**
 * A website's mark: its icon where one was found (`convex/websiteIcons.ts`),
 * its letter where none was or the icon will not load.
 */
describe("a website's mark", () => {
  it("draws the website's icon when it has one", () => {
    const { container } = render(<SiteMark host="kordatackle.com" owned iconUrl="https://files.test/korda.png" />);

    expect(container.querySelector("img")).toHaveAttribute("src", "https://files.test/korda.png");
    expect(container).not.toHaveTextContent("K");
  });

  it("draws the letter when there is no icon", () => {
    const { container } = render(<SiteMark host="www.kordatackle.com" owned={false} iconUrl={null} />);

    expect(container.querySelector("img")).toBeNull();
    expect(container).toHaveTextContent("K");
  });

  it("falls back to the letter when the icon will not load", () => {
    const { container } = render(<SiteMark host="kordatackle.com" owned iconUrl="https://files.test/broken.png" />);

    fireEvent.error(container.querySelector("img")!);

    expect(container.querySelector("img")).toBeNull();
    expect(container).toHaveTextContent("K");
  });

  it("keeps the square for a website the company owns and the circle for a competitor", () => {
    const owned = render(<SiteMark host="a.com" owned iconUrl="https://files.test/a.png" />).container.firstElementChild;
    const rival = render(<SiteMark host="b.com" owned={false} iconUrl="https://files.test/b.png" />).container.firstElementChild;

    expect(owned).toHaveClass("rounded-[8px]");
    expect(rival).toHaveClass("rounded-full");
  });
});
