import { describe, expect, test } from "vitest";
import {
  matchDiscoveredSite,
  nameFingerprint,
  normalizePostcode,
  type KnownSite,
} from "./salesDataProspectMatching";

/**
 * Whether a discovered site is already a customer.
 *
 * The expensive mistake is not a missing prospect — it is a rep telephoning an
 * account the workspace has supplied for a decade because the register spells
 * its name differently. Every case here is a way that could happen.
 */

const KNOWN: KnownSite[] = [
  {
    key: "COLTEN CARE - AVON REACH",
    name: "COLTEN CARE - AVON REACH",
    postcode: "BH23 4AH",
    groupName: "COLTEN CARE",
  },
  {
    key: "DAISHS ESPLANADE HOTEL LTD",
    name: "DAISHS ESPLANADE HOTEL LTD",
    postcode: "YO11 2AA",
    groupName: "DAISH'S HOTELS",
  },
];

describe("matching a discovered site against the customers", () => {
  test("the same name is the same business", () => {
    expect(
      matchDiscoveredSite(
        { siteName: "Colten Care - Avon Reach", groupName: "Colten Care" },
        KNOWN
      )
    ).toMatchObject({ outcome: "KNOWN", on: "NAME" });
  });

  test("the same postcode settles it even when the names differ", () => {
    // The register publishes the home's own name; the workbook carries the
    // group's spelling of it. Two care homes do not share a postcode.
    expect(
      matchDiscoveredSite(
        { siteName: "Something Else Entirely", groupName: "Colten Care", postcode: "BH23 4AH" },
        KNOWN
      )
    ).toMatchObject({ outcome: "KNOWN", on: "POSTCODE" });
  });

  test("a postcode spelled differently is still the same postcode", () => {
    expect(
      matchDiscoveredSite(
        { siteName: "Something Else", groupName: "Colten Care", postcode: "bh234ah" },
        KNOWN
      )
    ).toMatchObject({ outcome: "KNOWN", on: "POSTCODE" });
  });

  test("the group's prefix and the usual suffixes do not make a new business", () => {
    // The exact pair this rule exists for.
    expect(
      matchDiscoveredSite({ siteName: "Avon Reach House", groupName: "Colten Care" }, KNOWN)
    ).toMatchObject({ outcome: "KNOWN", on: "FINGERPRINT" });
  });

  test("a genuinely new site is a prospect", () => {
    expect(
      matchDiscoveredSite(
        { siteName: "Bourne View", groupName: "Colten Care", postcode: "BH21 1AA" },
        KNOWN
      )
    ).toMatchObject({ outcome: "NEW" });
  });

  test("a name that reads familiar at a different postcode is filed, with the clash named", () => {
    const result = matchDiscoveredSite(
      { siteName: "Avon Reach House", groupName: "Colten Care", postcode: "SO41 9AA" },
      KNOWN
    );

    expect(result).toMatchObject({ outcome: "CONFLICT" });
    expect(result).toHaveProperty("note", expect.stringContaining("BH23 4AH"));
    expect(result).toHaveProperty("note", expect.stringContaining("SO41 9AA"));
  });

  test("two hotels in one chain do not collapse into each other", () => {
    // The failure that would quietly hide eight of the nine Daish's hotels.
    expect(
      matchDiscoveredSite(
        { siteName: "Hotel Prince Regent", groupName: "Daish's Hotels", postcode: "DT4 7NR" },
        KNOWN
      )
    ).toMatchObject({ outcome: "NEW" });
  });

  test("nothing on file means everything is new", () => {
    expect(
      matchDiscoveredSite({ siteName: "Avon Reach House", groupName: "Colten Care" }, [])
    ).toMatchObject({ outcome: "NEW" });
  });
});

describe("the identifying words of a name", () => {
  test("the group, the noise words and the ordering all fall away", () => {
    expect(nameFingerprint("COLTEN CARE - AVON REACH", "Colten Care")).toBe(
      nameFingerprint("Avon Reach House", "Colten Care")
    );
  });

  test("a name made only of its group and noise keeps its whole self", () => {
    // Otherwise every "<GROUP> LTD" account collapses onto one empty
    // fingerprint and the first of them swallows the rest.
    expect(nameFingerprint("COLTEN CARE LTD", "Colten Care")).not.toBe(
      nameFingerprint("DAISH'S HOTEL LTD", "Daish's Hotels")
    );
  });

  test("different sites keep different fingerprints", () => {
    expect(nameFingerprint("Bourne View", "Colten Care")).not.toBe(
      nameFingerprint("Braemar Lodge", "Colten Care")
    );
  });
});

describe("reading a postcode", () => {
  test.each([
    ["BH23 4AH", "BH234AH"],
    ["bh23 4ah", "BH234AH"],
    ["  BH23  4AH ", "BH234AH"],
  ])("%s reads as %s", (input, expected) => {
    expect(normalizePostcode(input)).toBe(expected);
  });

  test.each([undefined, "", "BH23", "   "])("%s is not a postcode", (input) => {
    expect(normalizePostcode(input)).toBeNull();
  });
});
