import { describe, expect, test } from "vitest";
import { addressOf, keptAddress, sameAddress } from "./pageAddresses";

/** A ranking page's full address kept once (core-data-normalisation-plan.md §6.2). */
describe("a page's full address beside its path", () => {
  const host = "morehandles.co.uk";

  test("the website's own host and the page keep nothing, with www or without", () => {
    expect(keptAddress("https://morehandles.co.uk/hinges/", host, "/hinges/")).toEqual({});
    expect(keptAddress("https://www.morehandles.co.uk/hinges/", host, "/hinges/")).toEqual({ www: true });
    expect(addressOf({ page: "/hinges/" }, host)).toBe("https://morehandles.co.uk/hinges/");
    expect(addressOf({ page: "/hinges/", www: true }, host)).toBe("https://www.morehandles.co.uk/hinges/");
  });

  test("anything else is kept as it was, and read back so", () => {
    for (const url of [
      "https://www.foxint.com/home/product/fox-micron-mx?c=bite-alarms",
      "http://www.morehandles.co.uk/hinges/",
      "https://shop.morehandles.co.uk/hinges/",
    ]) {
      const kept = keptAddress(url, host, "/hinges/");
      expect(kept).toEqual({ address: url });
      expect(addressOf({ ...kept, page: "/hinges/" }, host)).toBe(url);
    }
  });

  test("no address and no page is none; a row not yet moved reads its whole address", () => {
    expect(keptAddress(undefined, host, "")).toEqual({});
    expect(addressOf({ page: "" }, host)).toBeUndefined();
    expect(addressOf({ page: "/a/", url: "https://elsewhere.test/a/" }, host)).toBe("https://elsewhere.test/a/");
    expect(sameAddress({ www: true, address: undefined })).toEqual({ www: true });
  });
});
