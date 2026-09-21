import { describe, expect, test } from "vitest";

import {
  DEFAULT_LOCATION_CODE,
  SEO_LOCATIONS,
  findSeoLocation,
  resolveLocationCode,
} from "./seoLocations";

/**
 * The places a website can be watched from.
 *
 * Small tests over a small list, but the list is the whole guard: a free-text
 * location box would let somebody save a code that returns nothing for money,
 * and nothing about the response would say so.
 */
describe("the location list", () => {
  test("names every code exactly once", () => {
    const codes = SEO_LOCATIONS.map((location) => location.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("includes the default, so an unset website has somewhere to resolve to", () => {
    expect(findSeoLocation(DEFAULT_LOCATION_CODE)?.label).toBe("United Kingdom");
  });

  test("gives every entry something a person can read", () => {
    for (const location of SEO_LOCATIONS) {
      expect(location.label.length).toBeGreaterThan(3);
      expect(Number.isInteger(location.code)).toBe(true);
    }
  });

  test("does not invent a location it was not given", () => {
    expect(findSeoLocation(999999)).toBeNull();
  });
});

describe("resolving a website's location", () => {
  test("absent means the platform default, not 'nowhere'", () => {
    // Every DataForSEO operation needs a location. Leaving it out would only
    // move the decision into their defaults rather than ours.
    expect(resolveLocationCode(undefined)).toBe(DEFAULT_LOCATION_CODE);
  });

  test("a stored place wins", () => {
    expect(resolveLocationCode(1006925)).toBe(1006925);
  });
});
