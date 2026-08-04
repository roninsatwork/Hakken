import { describe, expect, test } from "vitest";
import * as registerService from "./salesDataRegisterCoverageService";
import {
  computeCoverage,
  dedupeRegisterLocations,
  extractProviderIds,
  parseProviderPage,
  providerBelongsToGroup,
} from "./salesDataRegisterCoverageService";

/**
 * The register check.
 *
 * What these hold in place: provider pages are found by web search and read as
 * pages, so the parsing runs against the register's markdown as the page
 * reader returns it — the fixture below is a slice of Colten Care's real
 * services page; providers are claimed for a group by identifying words
 * rather than exact names; re-registered homes count once; and the arithmetic
 * uses the same matching rules the finder itself is held to.
 */

describe("finding the group's providers", () => {
  test("collects distinct provider ids from a search's answers", () => {
    const ids = extractProviderIds([
      { url: "https://www.cqc.org.uk/provider/1-120628678/services" },
      { url: "https://www.cqc.org.uk/provider/1-120628678" },
      { url: "https://www.cqc.org.uk/provider/1-101657781/contact" },
      { url: "https://www.cqc.org.uk/location/1-135873217" },
      { url: "https://en.wikipedia.org/wiki/Care_Quality_Commission" },
    ]);
    expect(ids).toEqual(["1-120628678", "1-101657781"]);
  });

  test("the registered company's name begins with the group's", () => {
    expect(providerBelongsToGroup("Colten Care (1993) Limited", "Colten Care")).toBe(true);
    expect(providerBelongsToGroup("Colten Care Limited", "Colten Care")).toBe(true);
    expect(providerBelongsToGroup("Allegra Care Hampshire Ltd", "Allegra Care")).toBe(true);
    expect(
      providerBelongsToGroup("Kanesbury Care (Kingsman House Care Home) Limited", "Kanesbury Care")
    ).toBe(true);
  });

  test("a lookalike the search surfaced is not claimed", () => {
    expect(providerBelongsToGroup("Bupa Care Homes Limited", "Colten Care")).toBe(false);
    // The first live run's catch: both contain "Luxury Care", neither is it.
    expect(providerBelongsToGroup("Acorn Luxury Care Limited", "Luxury Care")).toBe(false);
    expect(providerBelongsToGroup("London Luxury care LTD", "Luxury Care")).toBe(false);
    // A renamed group genuinely is not found — that is the PROVIDER_NOT_FOUND
    // row's job to say, not a match to force.
    expect(providerBelongsToGroup("Kanesbury Care (Seabourne House) Limited", "Luxury Care")).toBe(
      false
    );
  });
});

/** A slice of Colten Care (1993) Limited's services page, as the reader returns it. */
const PROVIDER_PAGE = `
# Colten Care (1993) Limited

## Locations

[Avon Reach](https://www.cqc.org.uk/location/1-135837598)

Farm Lane, Mudeford, Christchurch, Dorset, BH23 4AH

[Full details](https://www.cqc.org.uk/location/1-135837598)

[Newstone House](https://www.cqc.org.uk/location/1-316776344)

Archived: this location is no longer registered.

[See old profile](https://www.cqc.org.uk/location/1-316776344)

[Newstone House](https://www.cqc.org.uk/location/1-11415643531)

Bristol Road, Sherborne, Dorset, DT9 4HG

[Full details](https://www.cqc.org.uk/location/1-11415643531)

[St Catherine's View](https://www.cqc.org.uk/location/1-415673085)

18-20 Stratford Road, Salisbury, Wiltshire, SP1 3JH

[Full details](https://www.cqc.org.uk/location/1-415673085)
`;

describe("reading a provider's page", () => {
  test("names the locations, keeps postcodes, and counts a re-registered home once", () => {
    const locations = parseProviderPage(PROVIDER_PAGE);

    expect(locations).toEqual([
      { name: "Avon Reach", postcode: "BH23 4AH", registered: true },
      // The archived registration and the live one are one home, and live wins.
      { name: "Newstone House", postcode: "DT9 4HG", registered: true },
      { name: "St Catherine's View", postcode: "SP1 3JH", registered: true },
    ]);
  });

  test("a page with no locations reads as empty, not as a failure", () => {
    expect(parseProviderPage("# Somebody Else Entirely\n\nNo locations here.")).toEqual([]);
  });

  test("the same home under two providers counts once across the union", () => {
    const merged = dedupeRegisterLocations([
      { name: "Newstone House", registered: false },
      { name: "Newstone House", postcode: "DT9 4HG", registered: true },
    ]);
    expect(merged).toEqual([{ name: "Newstone House", postcode: "DT9 4HG", registered: true }]);
  });
});

describe("hunting the companies no search surfaced", () => {
  test("a home on file that the register picture does not explain is hunted", () => {
    const { unmatchedKnownSites } = registerService;
    const unmatched = unmatchedKnownSites(
      "Allegra Care",
      [{ name: "Fairmile Grange Care Home", postcode: "BH23 2BY", registered: true }],
      [
        { key: "FAIRMILE GRANGE", name: "Fairmile Grange", groupName: "Allegra Care" },
        { key: "MAGDALEN HOUSE CARE HOME", name: "Magdalen House Care Home", groupName: "Allegra Care" },
      ]
    );
    expect(unmatched.map((site) => site.name)).toEqual(["Magdalen House Care Home"]);
  });

  test("a location's page names its company", () => {
    const { extractProviderIdFromLocationPage } = registerService;
    expect(
      extractProviderIdFromLocationPage(
        "Provided and run by: [Allegra Fairmile Grange Limited](https://www.cqc.org.uk/provider/1-19888374275)"
      )
    ).toBe("1-19888374275");
    expect(extractProviderIdFromLocationPage("No provider link here.")).toBeNull();
  });
});

describe("the coverage arithmetic", () => {
  const known = [
    { key: "AVON REACH", name: "Avon Reach", groupName: "Colten Care", postcode: "BH23 4AH" },
    { key: "NEWSTONE HOUSE", name: "Newstone House", groupName: "Colten Care" },
  ];

  test("counts only live registrations, and names what is not on file", () => {
    const coverage = computeCoverage(
      "Colten Care",
      [
        { name: "Avon Reach", postcode: "BH23 4AH", registered: true },
        // The register spells it its own way; the identifying words still match.
        { name: "Colten Care - Newstone", registered: true },
        { name: "St Catherine's View", postcode: "SP1 3JH", registered: true },
        { name: "Belmore Lodge", registered: false },
      ],
      known
    );

    expect(coverage.registerCount).toBe(3);
    expect(coverage.accountedFor).toBe(2);
    expect(coverage.missing).toEqual([{ name: "St Catherine's View", postcode: "SP1 3JH" }]);
  });

  test("a clean sweep reports no missing homes", () => {
    const coverage = computeCoverage(
      "Colten Care",
      [{ name: "Avon Reach", postcode: "BH23 4AH", registered: true }],
      known
    );
    expect(coverage).toEqual({ registerCount: 1, accountedFor: 1, missing: [] });
  });
});
