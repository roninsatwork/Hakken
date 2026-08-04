import { describe, expect, test } from "vitest";
import {
  computeCoverage,
  parseLocation,
  parseProviderLocationIds,
  parseProviderSearch,
  providerBelongsToGroup,
} from "./salesDataRegisterCoverageService";

/**
 * The register check.
 *
 * What these hold in place: the register's answers are parsed defensively so a
 * shape change becomes a named failure, providers are claimed for a group by
 * identifying words rather than exact names, and the arithmetic counts only
 * live care homes — against the same matching rules the finder itself is held
 * to.
 */

describe("parsing the register's answers", () => {
  test("reads providers out of a search answer, skipping malformed entries", () => {
    const parsed = parseProviderSearch({
      providers: [
        { providerId: "1-101", providerName: "Colten Care (1993) Limited" },
        { providerId: "", providerName: "No id" },
        { providerName: "No id at all" },
        "not even an object",
      ],
      total: 4,
    });
    expect(parsed).toEqual([{ providerId: "1-101", providerName: "Colten Care (1993) Limited" }]);
  });

  test("an alien search shape is a named failure, not an empty list", () => {
    expect(parseProviderSearch({ results: [] })).toBeNull();
    expect(parseProviderSearch(undefined)).toBeNull();
  });

  test("reads a provider's location ids, and refuses an alien shape", () => {
    expect(parseProviderLocationIds({ locationIds: ["1-a", "1-b", ""] })).toEqual(["1-a", "1-b"]);
    expect(parseProviderLocationIds({ locations: [] })).toBeNull();
  });

  test("reads a location under either name field, keeping status and kind", () => {
    expect(
      parseLocation({
        locationName: "Woodpeckers",
        postalCode: "SO42 7RX",
        registrationStatus: "Registered",
        careHome: "Y",
      })
    ).toEqual({ name: "Woodpeckers", postcode: "SO42 7RX", registered: true, careHome: true });

    expect(
      parseLocation({ name: "Head Office", registrationStatus: "Deregistered", careHome: "N" })
    ).toEqual({ name: "Head Office", registered: false, careHome: false });

    expect(parseLocation({ postalCode: "SO42 7RX" })).toBeNull();
  });
});

describe("claiming providers for a group", () => {
  test("the registered company name carries the group's words", () => {
    expect(providerBelongsToGroup("Colten Care (1993) Limited", "Colten Care")).toBe(true);
    expect(
      providerBelongsToGroup("Kanesbury Care (Kingsman House Care Home) Limited", "Kanesbury Care")
    ).toBe(true);
    expect(providerBelongsToGroup("Allegra Symphony Care Ltd", "Allegra Care")).toBe(true);
  });

  test("a different business is not claimed", () => {
    expect(providerBelongsToGroup("Bupa Care Homes Limited", "Colten Care")).toBe(false);
    // A renamed group genuinely is not found — that is the PROVIDER_NOT_FOUND
    // row's job to say, not a match to force.
    expect(providerBelongsToGroup("Kanesbury Care (Seabourne House) Limited", "Luxury Care")).toBe(
      false
    );
  });
});

describe("the coverage arithmetic", () => {
  const known = [
    { key: "WOODPECKERS", name: "Woodpeckers", groupName: "Colten Care", postcode: "SO42 7RX" },
    { key: "LINDEN HOUSE", name: "Linden House", groupName: "Colten Care" },
  ];

  test("counts only live care homes, and names what is not on file", () => {
    const coverage = computeCoverage(
      "Colten Care",
      [
        { name: "Woodpeckers", postcode: "SO42 7RX", registered: true, careHome: true },
        // The register spells it its own way; the postcode is absent; the
        // identifying words still match Linden House.
        { name: "Colten Care - Linden", registered: true, careHome: true },
        { name: "Avon Reach", postcode: "SO41 0GG", registered: true, careHome: true },
        // Offices and closed homes are not gaps.
        { name: "Colten Care Head Office", registered: true, careHome: false },
        { name: "Belmore Lodge", registered: false, careHome: true },
      ],
      known
    );

    expect(coverage.registerCount).toBe(3);
    expect(coverage.accountedFor).toBe(2);
    expect(coverage.missing).toEqual([{ name: "Avon Reach", postcode: "SO41 0GG" }]);
  });

  test("a clean sweep reports no missing homes", () => {
    const coverage = computeCoverage(
      "Colten Care",
      [{ name: "Woodpeckers", postcode: "SO42 7RX", registered: true, careHome: true }],
      known
    );
    expect(coverage).toEqual({ registerCount: 1, accountedFor: 1, missing: [] });
  });
});
