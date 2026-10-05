import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkedHost, SiteMark } from "./SiteMark";
import { heldIcon } from "./siteGroups";

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

/**
 * The icon of a website a list names without one: found among the company's
 * own holds, by hold or by host, and only there.
 */
describe("a held website's icon", () => {
  const holds = [
    { siteId: "hold_1", host: "kordatackle.com", iconUrl: "data:image/png;base64,KORDA" },
    { siteId: "hold_2", host: "nashtackle.co.uk", iconUrl: null },
  ];

  it("is found by the hold or by the host, however the host is written", () => {
    expect(heldIcon(holds, { siteId: "hold_1" })).toBe("data:image/png;base64,KORDA");
    expect(heldIcon(holds, { host: "WWW.KordaTackle.com" })).toBe("data:image/png;base64,KORDA");
  });

  it("is none for a host the company does not hold, one without an icon, or before the holds arrive", () => {
    expect(heldIcon(holds, { host: "someoneelse.com" })).toBeNull();
    expect(heldIcon(holds, { siteId: "hold_2" })).toBeNull();
    expect(heldIcon(undefined, { siteId: "hold_1" })).toBeNull();
  });
});

describe("a website named in a list", () => {
  it("draws its small mark before its name, or before the name it is given", () => {
    const plain = render(<MarkedHost host="kordatackle.com" owned iconUrl="https://files.test/korda.png" />).container;
    expect(plain.querySelector("img")).toHaveAttribute("src", "https://files.test/korda.png");
    expect(plain).toHaveTextContent("kordatackle.com");

    const named = render(<MarkedHost host="kordatackle.com" owned={false}><a href="/rival">You (kordatackle.com)</a></MarkedHost>).container;
    expect(named.querySelector("a")).toHaveTextContent("You (kordatackle.com)");
    expect(named).toHaveTextContent("K");
  });
});
