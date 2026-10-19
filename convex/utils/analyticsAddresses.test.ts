import { describe, expect, test } from "vitest";
import {
  MOST_ADDRESSES,
  conversionAddressesOf,
  countsConversions,
  eventsWithAddresses,
  hakkenCounts,
  isCopyAddress,
  isSameDomain,
  kindOf,
  monthWithAddresses,
  readAddresses,
  type HeldAddress,
} from "./analyticsAddresses";

/**
 * Which of a property's other addresses a website's conversions are counted on
 * (docs/plans/active/conversion-addresses-plan.md), held to the addresses the
 * dev deployment's properties really record on 2026-10-19.
 */
describe("what an address is", () => {
  test("National Extension College's shop is under its own address; its staging and translated copies are copies", () => {
    expect(kindOf("store.nec.ac.uk", "nec.ac.uk")).toBe("SAME_DOMAIN");
    expect(kindOf("nec.cm-hosting.com", "nec.ac.uk")).toBe("OTHER_DOMAIN");
    expect(kindOf("nec.staging.cm-hosting.com", "nec.ac.uk")).toBe("COPY");
    expect(kindOf("www-nec-ac-uk.translate.goog", "nec.ac.uk")).toBe("COPY");
  });

  test("developers' machines and hosting previews are copies", () => {
    for (const host of ["morehandles.loc", "phg-morehandles.ddev.site", "silly-mclean.77-68-13-134.plesk.page", "staging.nec.ac.uk", "dev-shop.example.com", "localhost", "192.168.0.4"]) {
      expect(isCopyAddress(host), host).toBe(true);
    }
  });

  test("a word only reads as a copy whole", () => {
    for (const host of ["contest-entries.co.uk", "devon-holidays.com", "korda.withcandour.dev", "book.fresha.com"]) {
      expect(isCopyAddress(host), host).toBe(false);
    }
  });

  test("an ending no live website uses says nothing when the website itself uses it", () => {
    expect(kindOf("store.acme-shop.test", "acme-shop.test")).toBe("SAME_DOMAIN");
    expect(kindOf("staging.acme-shop.test", "acme-shop.test")).toBe("COPY");
    expect(isCopyAddress("store.acme-shop.test")).toBe(true);
  });

  test("the website itself, www or not, is not under its own address", () => {
    expect(isSameDomain("www.nec.ac.uk", "nec.ac.uk")).toBe(false);
    expect(isSameDomain("nec.ac.uk", "www.nec.ac.uk")).toBe(false);
    expect(isSameDomain("shop.nec.ac.uk", "www.nec.ac.uk")).toBe(true);
    expect(isSameDomain("notnec.ac.uk", "nec.ac.uk")).toBe(false);
  });
});

describe("Hakken's choice", () => {
  const sale = [{ eventName: "purchase", year: 40, month: 3 }];

  test("an address under the website's own counts once a sale or a listed conversion happened on it", () => {
    expect(hakkenCounts({ kind: "SAME_DOMAIN", reached: false, events: sale })).toBe(true);
    expect(hakkenCounts({ kind: "SAME_DOMAIN", reached: false, events: [] })).toBe(false);
  });

  test("another domain counts only when visitors reach it from the website: a copy of the tag elsewhere never is", () => {
    expect(hakkenCounts({ kind: "OTHER_DOMAIN", reached: true, events: sale })).toBe(true);
    expect(hakkenCounts({ kind: "OTHER_DOMAIN", reached: false, events: [{ eventName: "contact", year: 3, month: 0 }] })).toBe(false);
  });

  test("a copy never counts, whatever happened on it; an admin's tick wins either way", () => {
    expect(hakkenCounts({ kind: "COPY", reached: true, events: sale })).toBe(false);
    expect(countsConversions({ kind: "COPY", reached: true, events: sale, counted: true })).toBe(true);
    expect(countsConversions({ kind: "SAME_DOMAIN", reached: false, events: sale, counted: false })).toBe(false);
  });
});

describe("reading the addresses", () => {
  const nec = () => readAddresses({
    site: "nec.ac.uk",
    own: ["www.nec.ac.uk"],
    listed: ["purchase", "contact"],
    year: [
      { host: "www.nec.ac.uk", eventName: "contact", count: 1900 },
      { host: "store.nec.ac.uk", eventName: "purchase", count: 2400 },
      { host: "store.nec.ac.uk", eventName: "add_to_cart", count: 9000 },
      { host: "nec.staging.cm-hosting.com", eventName: "purchase", count: 12 },
      { host: "spam.example.org", eventName: "contact", count: 2 },
      { host: "blog.nec.ac.uk", eventName: "page_view", count: 300 },
    ],
    month: [{ host: "store.nec.ac.uk", eventName: "purchase", count: 210 }],
    reached: new Set(["store.nec.ac.uk"]),
  });

  test("the shop is held with its sales and counts; the website's own address is never held", () => {
    const held = nec();
    const store = held.find((address) => address.host === "store.nec.ac.uk")!;
    expect(store).toEqual({ host: "store.nec.ac.uk", kind: "SAME_DOMAIN", reached: true, events: [{ eventName: "purchase", year: 2400, month: 210 }] });
    expect(held.some((address) => address.host === "www.nec.ac.uk")).toBe(false);
    expect(conversionAddressesOf(held)).toEqual(["store.nec.ac.uk"]);
  });

  test("a copy and someone else's site are held to say so, never counted; an address under the website's own is held without a sale", () => {
    const held = nec();
    expect(held.map((address) => [address.host, address.kind, countsConversions(address)])).toEqual([
      ["store.nec.ac.uk", "SAME_DOMAIN", true],
      ["nec.staging.cm-hosting.com", "COPY", false],
      ["spam.example.org", "OTHER_DOMAIN", false],
      ["blog.nec.ac.uk", "SAME_DOMAIN", false],
    ]);
  });

  test("an admin's tick stays while it differs from Hakken's choice, and goes once Hakken agrees", () => {
    const before: HeldAddress[] = [
      { host: "spam.example.org", kind: "OTHER_DOMAIN", reached: false, events: [], counted: true },
      { host: "store.nec.ac.uk", kind: "SAME_DOMAIN", reached: true, events: [], counted: true },
    ];
    const held = readAddresses({ site: "nec.ac.uk", own: ["www.nec.ac.uk"], listed: ["contact"], year: [
      { host: "spam.example.org", eventName: "contact", count: 2 },
      { host: "store.nec.ac.uk", eventName: "purchase", count: 5 },
    ], month: [], reached: new Set(), before });
    expect(held.find((address) => address.host === "spam.example.org")?.counted).toBe(true);
    expect(held.find((address) => address.host === "store.nec.ac.uk")?.counted).toBeUndefined();
  });

  test("a property full of spam holds its busiest addresses only", () => {
    const year = Array.from({ length: MOST_ADDRESSES + 10 }, (_, index) => ({ host: `spam${index}.example.org`, eventName: "contact", count: index + 1 }));
    const held = readAddresses({ site: "nec.ac.uk", own: ["www.nec.ac.uk"], listed: ["contact"], year, month: [], reached: new Set() });
    expect(held).toHaveLength(MOST_ADDRESSES);
    expect(held[0].host).toBe(`spam${MOST_ADDRESSES + 9}.example.org`);
  });
});

describe("an event's count on every address that counts", () => {
  const held: HeldAddress[] = [
    { host: "store.nec.ac.uk", kind: "SAME_DOMAIN", reached: true, events: [{ eventName: "purchase", year: 2400, month: 210 }] },
    { host: "nec.staging.cm-hosting.com", kind: "COPY", reached: false, events: [{ eventName: "purchase", year: 12, month: 1 }] },
  ];

  test("NEC's Purchase reads the shop's sales, never the staging site's", () => {
    expect(monthWithAddresses({ eventName: "purchase", lastThirtyDays: 0 }, held)).toBe(210);
    expect(eventsWithAddresses([{ eventName: "contact", lastThirtyDays: 157 }], held)).toEqual([{ eventName: "contact", lastThirtyDays: 157 }]);
  });

  test("a draft's ticks say which addresses count before they are saved", () => {
    expect(monthWithAddresses({ eventName: "purchase", lastThirtyDays: 0 }, held, () => false)).toBe(0);
    expect(monthWithAddresses({ eventName: "purchase", lastThirtyDays: 0 }, held, () => true)).toBe(211);
  });
});
