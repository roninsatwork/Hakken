import { describe, expect, test } from "vitest";
import { pageName } from "./pageNames";

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
