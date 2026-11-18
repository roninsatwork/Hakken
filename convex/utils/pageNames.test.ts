import { describe, expect, test } from "vitest";
import { pageName, shortTitle } from "./pageNames";

describe("a page by the name a person would say", () => {
  test.each([
    ["https://www.morehandles.co.uk/", "Home page"],
    ["/", "Home page"],
    ["/checkout/cart/", "Basket"],
    ["/checkout/onepage/success/", "Order complete"],
    ["/checkout/", "Checkout"],
    ["/catalogsearch/result/index/", "Search results"],
    ["/customer/account/login/referer/abc/", "Log in"],
    ["/cart", "Basket"],
    ["/my-account/orders", "Your account"],
  ])("%s", (address, name) => expect(pageName(address)).toBe(name));

  test("any other page takes its name from its address", () => {
    expect(pageName("/door-handles/black-door-handles.html")).toBe("Black door handles");
    expect(pageName("https://www.morehandles.co.uk/blog/tubular-latch-guide/?x=1")).toBe("Tubular latch guide");
  });
});

describe("a page's title, short, for a chart's key (Anthony, 17 November 2026: \"i dont like long axis lables\")", () => {
  test.each([
    ["A Guide To Choose The Right Tubular Latch - Our Blog", "A Guide To Choose The Right…"],
    ["Cupboard Handles and Knobs | More Handles", "Cupboard Handles and Knobs"],
    ["What is a Spindle and what kind do I need? - Our Blog", "What is a Spindle and what…"],
    ["Hinges", "Hinges"],
    // A non-breaking space beside the bar, as More Handles' titles have it (18 November 2026), and an en dash.
    ["Door Handles |\u00a0More Handles", "Door Handles"],
    ["Garden Chairs \u2013 Our Shop", "Garden Chairs"],
    ["| More Handles", "| More Handles"],
    ["Supercalifragilisticexpialidociousandmore words", "Supercalifragilisticexpialid…"],
  ])("%s", (title, short) => expect(shortTitle(title)).toBe(short));
});
