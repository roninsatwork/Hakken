import { describe, expect, test } from "vitest";
import { namedIn, placeName } from "./placeNames";

/**
 * The places a search or a page names (placeNames.ts), as Keyword
 * cannibalisation weighs them: a town with its county, the website's own
 * country naming no one place, "near me", and everyday words never towns.
 */
describe("the places a search or a page names", () => {
  test("a town is named with its county, the longest name first", () => {
    expect(namedIn("web design guildford", "GB").places).toEqual(["guildford", "surrey"]);
    expect(namedIn("/web-design-surrey/", "GB").places).toEqual(["surrey"]);
    expect(namedIn("web design west sussex", "GB").places).toEqual(["west sussex", "sussex"]);
    expect(namedIn("app developers new york", "GB").places).toEqual(["new york"]);
    expect(namedIn("St. Albans web design", "GB").places).toEqual(["st albans", "hertfordshire"]);
  });

  test("the website's own country names no one place; another country is a place", () => {
    expect(namedIn("app developers uk", "GB")).toEqual({ places: [], near: false, country: true });
    expect(namedIn("web design agency london uk", "GB")).toMatchObject({ places: ["london"], country: true });
    expect(namedIn("app developers uae", "GB").places).toEqual(["uae"]);
  });

  test("\"near me\" is read, and an everyday word is never a town", () => {
    expect(namedIn("web designer near me", "GB")).toEqual({ places: [], near: true, country: false });
    expect(namedIn("further reading on web design", "GB").places).toEqual([]);
    expect(namedIn("/hub/how-to-choose-a-web-design-agency/", "GB").places).toEqual([]);
  });

  test("a place is written as a client reads it", () => {
    expect(placeName("west sussex")).toBe("West Sussex");
    expect(placeName("stoke on trent")).toBe("Stoke on Trent");
    expect(placeName("uae")).toBe("UAE");
  });
});
