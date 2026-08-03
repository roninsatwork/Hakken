import { describe, expect, test } from "vitest";
import {
  buildGapProducts,
  collectReportFigures,
  estimateProspect,
  findGroupGaps,
  findUnsupportedFigures,
  median,
  summariseOpportunities,
  type ComparableCustomer,
  type GroupMemberSpend,
  type ProspectSubject,
} from "./salesOpportunityService";

/**
 * The estimates are the report. Every case here is a way a figure could be
 * wrong while looking plausible — the exact failure the report exists to
 * avoid, because these numbers go in front of a client as potential revenue.
 */

const careHome = (
  name: string,
  group: string,
  totalRevenueGBP: number,
  size: number | null
): ComparableCustomer => ({
  accountNameKey: name.toUpperCase(),
  accountName: name,
  groupNameKey: group.toUpperCase(),
  groupName: group,
  customerTypeKey: "CARE HOMES",
  totalRevenueGBP,
  size,
});

const prospect = (overrides: Partial<ProspectSubject> = {}): ProspectSubject => ({
  prospectKey: "AVON REACH",
  siteName: "Avon Reach",
  groupNameKey: "COLTEN CARE",
  groupName: "Colten Care",
  customerTypeKey: "CARE HOMES",
  customerType: "Care Homes",
  size: 60,
  ...overrides,
});

describe("pricing a prospect", () => {
  test("a sized prospect is priced per bed from its own chain", () => {
    // £100/bed and £200/bed in the chain: the median rate is £150, and a
    // 60-bed prospect is worth £9,000 — reproducible by hand from the row.
    const result = estimateProspect(prospect(), [
      careHome("Fairmile Grange", "Colten Care", 4000, 40),
      careHome("Belmore Lodge", "Colten Care", 10000, 50),
    ]);
    expect(result).toMatchObject({
      confidence: "GROUP_SIZED",
      ratePerUnitGBP: 150,
      estimateGBP: 9000,
    });
    expect(result.comparedTo).toHaveLength(2);
  });

  test("one odd sibling cannot bend the rate, because it is a median", () => {
    const result = estimateProspect(prospect(), [
      careHome("Fairmile Grange", "Colten Care", 4000, 40), // £100/bed
      careHome("Belmore Lodge", "Colten Care", 5000, 50), // £100/bed
      careHome("The Flagship", "Colten Care", 90000, 30), // £3,000/bed
    ]);
    expect(result.ratePerUnitGBP).toBe(100);
    expect(result.estimateGBP).toBe(6000);
  });

  test("a chain with one sized customer widens to the type, and says so", () => {
    // One sized sibling is an anecdote, not a chain rate. The pool widens to
    // every sized care home, and the confidence tier tells the reader.
    const result = estimateProspect(prospect(), [
      careHome("Fairmile Grange", "Colten Care", 4000, 40),
      careHome("Rival Home A", "Other Group", 6000, 30),
      careHome("Rival Home B", "Another Group", 12000, 60),
    ]);
    expect(result.confidence).toBe("TYPE_SIZED");
    expect(result.comparedTo).toHaveLength(3);
    // Rates £100, £200, £200 → median £200 × 60 beds.
    expect(result.estimateGBP).toBe(12000);
  });

  test("an unsized prospect falls back to its chain's average, marked", () => {
    const result = estimateProspect(prospect({ size: null }), [
      careHome("Fairmile Grange", "Colten Care", 4000, 40),
      careHome("Belmore Lodge", "Colten Care", 6000, null),
    ]);
    expect(result).toMatchObject({
      confidence: "GROUP_AVERAGE",
      estimateGBP: 5000,
      ratePerUnitGBP: null,
    });
  });

  test("an unsized prospect in an unknown chain averages its whole type", () => {
    const result = estimateProspect(prospect({ size: null, groupNameKey: "NOBODY" }), [
      careHome("Rival Home A", "Other Group", 3000, null),
      careHome("Rival Home B", "Another Group", 5000, null),
    ]);
    expect(result).toMatchObject({ confidence: "TYPE_AVERAGE", estimateGBP: 4000 });
  });

  test("schools are priced per pupil, not per bed", () => {
    const school: ComparableCustomer = {
      ...careHome("St Mary's", "Diocese Trust", 8000, 400),
      customerTypeKey: "EDUCATION - RESIDENTIAL",
    };
    const result = estimateProspect(
      prospect({
        customerTypeKey: "EDUCATION - RESIDENTIAL",
        customerType: "Education - Residential",
        groupNameKey: "DIOCESE TRUST",
        groupName: "Diocese Trust",
        size: 200,
      }),
      [school, { ...school, accountName: "St Bede's", accountNameKey: "ST BEDES" }]
    );
    expect(result.sizeUnit).toBe("pupils");
    // £20 per pupil × 200 pupils.
    expect(result.estimateGBP).toBe(4000);
  });

  test("a type with no size rule goes straight to averages", () => {
    const pub: ComparableCustomer = {
      ...careHome("The Crown", "Pubco", 2000, null),
      customerTypeKey: "PUBS",
    };
    const result = estimateProspect(
      prospect({ customerTypeKey: "PUBS", customerType: "Pubs", size: 60 }),
      [pub]
    );
    expect(result.sizeUnit).toBeNull();
    expect(result.confidence).toBe("TYPE_AVERAGE");
  });

  test("comparables never cross customer types", () => {
    // A hotel's spend must not price a care home, however similar the size.
    const hotel: ComparableCustomer = {
      ...careHome("Grand Hotel", "Colten Care", 50000, 60),
      customerTypeKey: "HOTELS",
    };
    const result = estimateProspect(prospect(), [hotel]);
    expect(result.confidence).toBe("NONE");
    expect(result.estimateGBP).toBeNull();
  });

  test("nothing to compare against is an exception, not a guess", () => {
    const result = estimateProspect(prospect(), []);
    expect(result).toMatchObject({ confidence: "NONE", estimateGBP: null });
    expect(result.basis).toContain("No");
  });
});

const member = (
  name: string,
  categories: Array<[string, number]>,
  size: number | null = null,
  group = "Colten Care"
): GroupMemberSpend => ({
  accountNameKey: name.toUpperCase(),
  accountName: name,
  groupNameKey: group.toUpperCase(),
  groupName: group,
  size,
  categories: categories.map(([category, spendGBP]) => ({
    categoryKey: category.toUpperCase(),
    category,
    spendGBP,
  })),
});

describe("finding the gaps inside a chain", () => {
  test("a category the siblings buy and one member does not is a gap", () => {
    const { gaps } = findGroupGaps([
      member("Home A", [["Toilet Rolls", 300], ["Gloves", 100]]),
      member("Home B", [["Toilet Rolls", 500]]),
      member("Home C", [["Gloves", 80]]),
    ]);
    const missingRolls = gaps.find(
      (gap) => gap.accountName === "Home C" && gap.category === "Toilet Rolls"
    );
    // Two siblings buy at £300 and £500: the gap is priced at the median.
    expect(missingRolls).toMatchObject({
      buyersCount: 2,
      siblingCount: 2,
      estimateGBP: 400,
      scaledBySize: false,
    });
  });

  test("the gap scales per bed when both sides have sizes", () => {
    const { gaps } = findGroupGaps([
      member("Home A", [["Toilet Rolls", 400]], 40), // £10/bed
      member("Home B", [["Toilet Rolls", 1200]], 60), // £20/bed
      member("Home C", [], 80),
    ]);
    const gap = gaps.find((entry) => entry.accountName === "Home C");
    // Median £15/bed × 80 beds, not the £800 the plain median would say.
    expect(gap).toMatchObject({ estimateGBP: 1200, scaledBySize: true });
  });

  test("a zero-value row is not buying, so it stays a gap", () => {
    const { gaps } = findGroupGaps([
      member("Home A", [["Toilet Rolls", 300]]),
      member("Home B", [["Toilet Rolls", 0]]),
    ]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ accountName: "Home B", buyersCount: 1 });
  });

  test("a chain of one has no siblings and produces nothing", () => {
    const { gaps, groupsExamined } = findGroupGaps([
      member("Lone Home", [["Toilet Rolls", 300]], null, "Solo Group"),
    ]);
    expect(gaps).toHaveLength(0);
    expect(groupsExamined).toBe(0);
  });

  test("chains do not leak into each other", () => {
    const { gaps } = findGroupGaps([
      member("Home A", [["Toilet Rolls", 300]], null, "Colten Care"),
      member("Home B", [], null, "Colten Care"),
      member("Rival Home", [["Mops", 900]], null, "Other Group"),
      member("Rival Twin", [["Mops", 900]], null, "Other Group"),
    ]);
    // Home B is missing Toilet Rolls from its own chain — never Mops from
    // somebody else's.
    expect(gaps).toHaveLength(1);
    expect(gaps[0].category).toBe("Toilet Rolls");
  });

  test("wide coverage outranks a bigger number from one sibling", () => {
    const { gaps } = findGroupGaps([
      member("Home A", [["Gloves", 100], ["Champagne", 9000]]),
      member("Home B", [["Gloves", 120]]),
      member("Home C", [["Gloves", 90]]),
      member("Home D", []),
    ]);
    const forHomeD = gaps.filter((gap) => gap.accountName === "Home D");
    // Three of three siblings buy gloves; one buys champagne. The pattern
    // leads, the lead follows, whatever the money says.
    expect(forHomeD[0].category).toBe("Gloves");
    expect(forHomeD[1].category).toBe("Champagne");
  });
});

describe("the headline figures", () => {
  test("totals, sized counts and unpriced counts add up", () => {
    const priced = estimateProspect(prospect(), [
      careHome("Fairmile Grange", "Colten Care", 4000, 40),
      careHome("Belmore Lodge", "Colten Care", 10000, 50),
    ]);
    const unsized = estimateProspect(prospect({ prospectKey: "B", size: null }), [
      careHome("Fairmile Grange", "Colten Care", 4000, 40),
    ]);
    const unpriced = estimateProspect(prospect({ prospectKey: "C" }), []);
    const { gaps, groupsExamined } = findGroupGaps([
      member("Home A", [["Toilet Rolls", 300]]),
      member("Home B", []),
    ]);

    const headline = summariseOpportunities([priced, unsized, unpriced], gaps, groupsExamined);
    expect(headline).toMatchObject({
      prospectCount: 3,
      prospectsSized: 1,
      prospectsUnsized: 1,
      prospectsUnpriced: 1,
      gapCount: 1,
      groupsExamined: 1,
      prospectOpportunityGBP: 13000,
      gapOpportunityGBP: 300,
      totalOpportunityGBP: 13300,
    });
  });
});

describe("the summary safety catch", () => {
  test("figures the report holds are allowed, in any honest spelling", () => {
    const allowed = [9000, 13300.25];
    expect(findUnsupportedFigures("Worth £9,000 in total.", allowed)).toEqual([]);
    expect(findUnsupportedFigures("Worth £9000.00, see below.", allowed)).toEqual([]);
    expect(findUnsupportedFigures("£9k of it is one chain.", allowed)).toEqual([]);
    expect(findUnsupportedFigures("Roughly £13,300 overall.", allowed)).toEqual([]);
  });

  test("a figure the report does not hold is named and refused", () => {
    expect(findUnsupportedFigures("Convert these for £25,000.", [9000])).toEqual([
      "£25,000",
    ]);
  });

  test("rounding cannot smuggle a different number in", () => {
    // £13k against a computed £13,300 is the drift this exists to stop.
    expect(findUnsupportedFigures("Roughly £13k.", [13300])).toEqual(["£13k"]);
  });

  test("prose without money passes untouched", () => {
    expect(findUnsupportedFigures("The chains matter more than the singles.", [])).toEqual([]);
  });

  test("the allowed list covers estimates, rates, comparables and totals", () => {
    const priced = estimateProspect(prospect(), [
      careHome("Fairmile Grange", "Colten Care", 4000, 40),
      careHome("Belmore Lodge", "Colten Care", 10000, 50),
    ]);
    const { gaps, groupsExamined } = findGroupGaps([
      member("Home A", [["Toilet Rolls", 300]]),
      member("Home B", []),
    ]);
    const headline = summariseOpportunities([priced], gaps, groupsExamined);
    const figures = collectReportFigures(headline, [priced], gaps);
    // The rate (£150/bed), the estimate (£9,000), a comparable's spend
    // (£4,000), the gap (£300) and the totals are all quotable.
    for (const value of [150, 9000, 4000, 300, 9300]) {
      expect(figures).toContain(value);
    }
  });
});

describe("median", () => {
  test("odd, even and empty lists", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe("buildGapProducts", () => {
  const row = (
    group: string,
    category: string,
    productDescription: string,
    spendGBP: number
  ) => ({
    groupNameKey: group.toUpperCase(),
    categoryKey: category.toUpperCase(),
    productDescription,
    spendGBP,
  });
  const gap = (account: string, category: string, group: string) => ({
    accountNameKey: account.toUpperCase(),
    categoryKey: category.toUpperCase(),
    groupNameKey: group.toUpperCase(),
  });

  test("a gap carries the full order sheet, biggest sellers first", () => {
    const [sheet] = buildGapProducts(
      [
        row("Colten", "Chemicals", "Bleach 5L", 100),
        row("Colten", "Chemicals", "Degreaser", 400),
        row("Colten", "Chemicals", "Sanitiser gel", 300),
      ],
      [gap("Colten Uniform", "Chemicals", "Colten")]
    );
    // Every product, not a sample — the report educates, it does not tease.
    expect(sheet.products).toEqual([
      { description: "Degreaser", spendGBP: 400 },
      { description: "Sanitiser gel", spendGBP: 300 },
      { description: "Bleach 5L", spendGBP: 100 },
    ]);
  });

  test("one product bought by two sisters pools its spend under one line", () => {
    const [sheet] = buildGapProducts(
      [
        row("Colten", "Chemicals", "Bleach 5L", 60),
        row("Colten", "Chemicals", "Bleach 5L", 60),
        row("Colten", "Chemicals", "Degreaser", 100),
      ],
      [gap("Colten Uniform", "Chemicals", "Colten")]
    );
    expect(sheet.products).toEqual([
      { description: "Bleach 5L", spendGBP: 120 },
      { description: "Degreaser", spendGBP: 100 },
    ]);
  });

  test("another group's products cannot leak onto the sheet", () => {
    const [sheet] = buildGapProducts(
      [
        row("Colten", "Chemicals", "Bleach 5L", 100),
        row("Daish's", "Chemicals", "Pool chlorine", 900),
      ],
      [gap("Colten Uniform", "Chemicals", "Colten")]
    );
    expect(sheet.products).toEqual([{ description: "Bleach 5L", spendGBP: 100 }]);
  });

  test("zero-revenue and blank rows put nothing on an order sheet", () => {
    const [sheet] = buildGapProducts(
      [
        // The workbook's "bought nothing" — a row with no money on it.
        row("Colten", "Chemicals", "Bleach 5L", 0),
        row("Colten", "Chemicals", "   ", 500),
        row("Colten", "Chemicals", "Degreaser", 50),
      ],
      [gap("Colten Uniform", "Chemicals", "Colten")]
    );
    expect(sheet.products).toEqual([{ description: "Degreaser", spendGBP: 50 }]);
  });
});
