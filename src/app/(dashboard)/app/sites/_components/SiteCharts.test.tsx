import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AlongTick } from "./SiteCharts";

/**
 * A name beside bars along (`AlongTick`): one line centred on its row, or a
 * long name on two (`wrapName`), as Keyword cannibalisation's groups are.
 */
const drawn = (props: Parameters<typeof AlongTick>[0]) => {
  const { container } = render(<svg><AlongTick x={200} y={40} {...props} /></svg>);
  return [...container.querySelectorAll("tspan")].map((line) => ({ text: line.textContent, dy: line.getAttribute("dy") }));
};

describe("a name beside bars along", () => {
  it("is one line centred on its row", () => {
    expect(drawn({ payload: { value: "app developers" } })).toEqual([{ text: "app developers", dy: "0.355em" }]);
  });

  it("breaks a long name onto two lines, centred together", () => {
    expect(drawn({ payload: { value: "wordpress development agency" } })).toEqual([
      { text: "wordpress development", dy: "-0.3em" },
      { text: "agency", dy: "1.25em" },
    ]);
  });
});
