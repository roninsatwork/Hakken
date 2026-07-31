import { describe, expect, test } from "vitest";
import {
  MAX_PERIOD_COLUMNS,
  SalesDataImportError,
  normalizeKey,
  parseAreasOfInterestSheet,
  parseCategorySheet,
  parseFrequencySheet,
  parseSalesSheet,
  validateSheetMapping,
  type SheetRows,
} from "./salesDataImportService";

/**
 * The fixtures here are the shapes the real workbook actually has, quirks
 * included: a first heading of `Customer - Parent  Account  Number` with
 * doubled spaces, a product code column exported as `Product - C O L0`, date
 * objects as revenue headings, a category worksheet that labels its columns and
 * an areas-of-interest worksheet that only titles itself. Tidied-up fixtures
 * would pass while the real file failed.
 */

const SALES_HEADER = [
  "Customer - Parent  Account  Number",
  "Group Name",
  "Account Name",
  "Customer Type",
  "Product - C O L0",
  "UniqueID",
  "Product Description",
  "Product Category",
  "Product Type",
  new Date(Date.UTC(2026, 0, 1)),
  new Date(Date.UTC(2026, 1, 1)),
  new Date(Date.UTC(2026, 2, 1)),
  new Date(Date.UTC(2026, 3, 1)),
  new Date(Date.UTC(2026, 4, 1)),
  new Date(Date.UTC(2026, 5, 1)),
  "Quantity 6m",
];

function salesSheet(rows: SheetRows): SheetRows {
  return [SALES_HEADER, ...rows];
}

describe("normalizeKey", () => {
  test("collapses the three ways the source spells the same label", () => {
    // The category worksheet and the sales worksheet disagree on & against AND,
    // and several headings carry trailing spaces. All must land on one key.
    expect(normalizeKey("DISPENSERS & BRACKETS")).toBe(
      normalizeKey("DISPENSERS AND BRACKETS")
    );
    expect(normalizeKey("LIGHT EQUIPMENT ")).toBe(normalizeKey("LIGHT EQUIPMENT"));
    expect(normalizeKey("Catering Disposables & Food Packaging")).toBe(
      "CATERING DISPOSABLES AND FOOD PACKAGING"
    );
    expect(normalizeKey("EDUCATION - NON RESIDENTIAL ")).toBe(
      "EDUCATION - NON RESIDENTIAL"
    );
  });
});

describe("parseSalesSheet", () => {
  test("reads a row from the real column layout", () => {
    const { rows, periodLabels } = parseSalesSheet(
      salesSheet([
        [
          "COL20K",
          "COLTEN CARE",
          "COLTEN CARE LTD. KITCHEN",
          "CARE HOMES",
          "VD1.9",
          "COL20KVD1.9",
          "ELIA VACUUM BEVERAGE DECANTER",
          "LIGHT EQUIPMENT",
          "BEVERAGE SERVICE",
          null,
          141.6,
          377.6,
          null,
          null,
          192.12,
          15,
        ],
      ])
    );

    expect(periodLabels).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ]);

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.accountName).toBe("COLTEN CARE LTD. KITCHEN");
    expect(row.productCode).toBe("VD1.9");
    expect(row.uniqueId).toBe("COL20KVD1.9");
    expect(row.quantity).toBe(15);
    expect(row.totalRevenue).toBe(711.32);
  });

  test("every row carries its worksheet line number", () => {
    // Without this the table cannot be shown in file order: rows are written in
    // batches, and every document in one Convex transaction shares a creation
    // time, so insertion order does not survive. It is also what lets someone
    // point at a row on screen and find it in the spreadsheet.
    const { rows } = parseSalesSheet(
      salesSheet([
        ["A", "G", "ACC1", "HOTELS", "P1", "AP1", "DESC", "CHEMICALS", "TYPE",
          10, null, null, null, null, null, 1],
        ["B", "G", "ACC2", "HOTELS", "P2", "BP2", "DESC", "CHEMICALS", "TYPE",
          20, null, null, null, null, null, 1],
      ])
    );

    // Row 1 is the header, so the first data row is line 2.
    expect(rows.map((row) => row.sourceRow)).toEqual([2, 3]);
  });

  test("line numbers survive skipped rows", () => {
    const { rows, skippedRowNumbers } = parseSalesSheet(
      salesSheet([
        ["A", "G", "ACC1", "HOTELS", "P1", "AP1", "DESC", "CHEMICALS", "TYPE",
          10, null, null, null, null, null, 1],
        ["", "", "", "NOTE", "", "", "", "", "", null, null, null, null, null, null, null],
        ["B", "G", "ACC2", "HOTELS", "P2", "BP2", "DESC", "CHEMICALS", "TYPE",
          20, null, null, null, null, null, 1],
      ])
    );

    // The skipped line keeps its number rather than closing the gap, so the
    // numbers on screen still match the file.
    expect(rows.map((row) => row.sourceRow)).toEqual([2, 4]);
    expect(skippedRowNumbers).toEqual([3]);
  });

  test("a blank month stays absent rather than becoming zero", () => {
    // 64% of the cells in the real file are blank. Turning those into £0.00
    // would claim a sale was recorded at nothing, which is a different fact.
    const { rows } = parseSalesSheet(
      salesSheet([
        [
          "ALLEGR",
          "ALLEGRA CARE",
          "FAIRMILE GRANGE",
          "CARE HOMES",
          "CCMC",
          "ALLEGRCCMC",
          "CUPCAKE CASES MULTI COLOUR",
          "CATERING DISPOSABLES & FOOD PACKAGING",
          "BAKING CUPS & CASES",
          null,
          13.95,
          null,
          null,
          null,
          null,
          1,
        ],
      ])
    );

    expect(rows[0].period1).toBeUndefined();
    expect(rows[0].period2).toBe(13.95);
    expect(rows[0].period6).toBeUndefined();
    expect(rows[0].totalRevenue).toBe(13.95);
  });

  test("normalised keys are stored alongside the source spelling", () => {
    const { rows } = parseSalesSheet(
      salesSheet([
        [
          "COL20",
          "COLTEN CARE",
          "COLTEN CARE LTD - HOUSEKEEPING",
          "CARE HOMES",
          "PAD",
          "COL20PAD",
          "PLASTIC APRON DISPENSER",
          "DISPENSERS AND BRACKETS",
          "APRON DISPENSER ",
          22.25,
          null,
          null,
          null,
          null,
          null,
          1,
        ],
      ])
    );

    expect(rows[0].productCategory).toBe("DISPENSERS AND BRACKETS");
    expect(rows[0].productCategoryKey).toBe("DISPENSERS AND BRACKETS");
    // Surrounding whitespace goes — it is invisible on screen and only makes
    // the column ragged. The spelling itself is untouched.
    expect(rows[0].productType).toBe("APRON DISPENSER");
    expect(rows[0].productTypeKey).toBe("APRON DISPENSER");
  });

  test("credits keep their sign", () => {
    // The real file carries 16 negative figures — returns and credits. Losing
    // the sign would overstate revenue.
    const { rows } = parseSalesSheet(
      salesSheet([
        ["A", "G", "ACC", "HOTELS", "P1", "AP1", "DESC", "CHEMICALS", "TYPE",
          -45.5, null, null, null, null, null, -1],
      ])
    );

    expect(rows[0].period1).toBe(-45.5);
    expect(rows[0].totalRevenue).toBe(-45.5);
  });

  test("padding rows are skipped and reported, not counted", () => {
    const { rows, skippedRowNumbers } = parseSalesSheet(
      salesSheet([
        ["A", "G", "ACC", "HOTELS", "P1", "AP1", "DESC", "CHEMICALS", "TYPE",
          10, null, null, null, null, null, 1],
        [null, null, null, null, null, null, null, null, null,
          null, null, null, null, null, null, null],
        ["", "", "", "NOTE ROW", "", "", "", "", "", null, null, null, null, null, null, null],
      ])
    );

    expect(rows).toHaveLength(1);
    // Sheet row 4 — the fully blank row is dropped silently, the stray note is
    // reported so the import can say what it left out.
    expect(skippedRowNumbers).toEqual([4]);
  });

  test("derives the unique id when the export omits the column", () => {
    const header = SALES_HEADER.filter((cell) => cell !== "UniqueID");
    const { rows } = parseSalesSheet([
      header,
      ["COL20K", "COLTEN CARE", "KITCHEN", "CARE HOMES", "VD1.9", "DESC",
        "LIGHT EQUIPMENT", "BEVERAGE SERVICE", 10, null, null, null, null, null, 1],
    ]);

    expect(rows[0].uniqueId).toBe("COL20KVD1.9");
  });

  test("refuses a file whose columns it cannot identify", () => {
    expect(() =>
      parseSalesSheet([
        ["Something", "Else", new Date(Date.UTC(2026, 0, 1))],
        ["a", "b", 1],
      ])
    ).toThrow(SalesDataImportError);
  });

  test("refuses a file with no dated revenue columns", () => {
    const header = SALES_HEADER.filter((cell) => !(cell instanceof Date));
    expect(() => parseSalesSheet([header])).toThrow(/revenue columns/i);
  });

  test("refuses more revenue columns than the table holds", () => {
    // The decision was six fixed columns. A twelve-month file must say so
    // rather than quietly importing the first six months.
    const header = [
      ...SALES_HEADER,
      new Date(Date.UTC(2026, 6, 1)),
    ];

    expect(() => parseSalesSheet([header])).toThrow(
      new RegExp(`holds ${MAX_PERIOD_COLUMNS}`)
    );
  });

  test("finds the quantity column whatever span it names", () => {
    const header = SALES_HEADER.map((cell) =>
      cell === "Quantity 6m" ? "Quantity 12m" : cell
    );

    const { rows } = parseSalesSheet([
      header,
      ["A", "G", "ACC", "HOTELS", "P1", "AP1", "DESC", "CHEMICALS", "TYPE",
        10, null, null, null, null, null, 42],
    ]);

    expect(rows[0].quantity).toBe(42);
  });

  test("accepts ISO text headings from a re-exported file", () => {
    const header = SALES_HEADER.map((cell) =>
      cell instanceof Date ? cell.toISOString().slice(0, 10) : cell
    );

    const { periodLabels } = parseSalesSheet([header]);
    expect(periodLabels[0]).toBe("2026-01");
  });
});

describe("parseCategorySheet", () => {
  // The source is now a plain two-column table with a header row.
  const sheet: SheetRows = [
    ["CUSTOMER TYPE", "CATEGORY"],
    ["CARE HOMES", "MEDICAL"],
    ["CARE HOMES", "JANITORIAL"],
    ["HOTELS", "DISPENSERS & BRACKETS"],
    ["EDUCATION - RESIDENTIAL ", "LIGHT EQUIPMENT "],
  ];

  test("reads one field per source column", () => {
    const links = parseCategorySheet(sheet);

    expect(links).toHaveLength(4);
    expect(links[0]).toEqual({
      customerType: "CARE HOMES",
      customerTypeKey: "CARE HOMES",
      category: "MEDICAL",
      categoryKey: "MEDICAL",
    });
  });

  test("the header row is consumed, not imported", () => {
    // The reader this replaced treated the header as data and produced rows
    // whose customer type was the literal text "CUSTOMER TYPE".
    const links = parseCategorySheet(sheet);
    expect(links.map((link) => link.customerType)).not.toContain("CUSTOMER TYPE");
    expect(links.map((link) => link.category)).not.toContain("CATEGORY");
  });

  test("keys still bridge the two spellings and stray whitespace", () => {
    const links = parseCategorySheet(sheet);

    expect(links[2].category).toBe("DISPENSERS & BRACKETS");
    expect(links[2].categoryKey).toBe("DISPENSERS AND BRACKETS");
    expect(links[3].customerTypeKey).toBe("EDUCATION - RESIDENTIAL");
    expect(links[3].categoryKey).toBe("LIGHT EQUIPMENT");
  });

  test("tolerates a title row above the header", () => {
    const links = parseCategorySheet([["CATEGORIES", null], ...sheet]);
    expect(links).toHaveLength(4);
  });

  test("a repeated pairing is stored once", () => {
    const links = parseCategorySheet([...sheet, ["CARE HOMES", "MEDICAL "]]);
    expect(links).toHaveLength(4);
  });

  test("refuses a worksheet with nothing it recognises", () => {
    expect(() => parseCategorySheet([["CUSTOMER TYPE", "CATEGORY"]])).toThrow(
      SalesDataImportError
    );
    expect(() => parseCategorySheet([[null, null], ["", ""]])).toThrow(
      SalesDataImportError
    );
  });

  test("refuses the old grid layout instead of guessing at it", () => {
    // The grid reader is gone. What matters is that the old shape now fails
    // loudly: silently misreading it is what this rewrite exists to stop.
    const grid: SheetRows = [
      ["CATEGORIES", null, null],
      ["CARE HOMES", "HOTELS", "EDUCATION - RESIDENTIAL"],
      ["MEDICAL", "JANITORIAL", "BAGS"],
    ];

    const links = parseCategorySheet(grid);
    // Only the first two columns are read, and the customer-type header row is
    // not treated as data — so the result is small and obviously wrong rather
    // than a plausible-looking 25 rows.
    expect(links.length).toBeLessThan(4);
    expect(links.map((l) => l.customerType)).not.toContain("CUSTOMER TYPE");
  });
});

describe("parseAreasOfInterestSheet", () => {
  // This worksheet titles itself and then goes straight into data, with no
  // header row at all.
  const sheet: SheetRows = [
    ["PRODUCT TYPES OF PARTICULAR INTEREST", null],
    ["CARE HOMES", "LAUNDRY LIQUIDS"],
    ["CARE HOMES", "DISPOSABLE GLOVES"],
    ["CARE HOMES", "INCONTINENCE "],
    ["HOTELS", "TOILET ROLLS"],
  ];

  test("skips the title row and reads the pairs", () => {
    const rows = parseAreasOfInterestSheet(sheet);

    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({
      customerType: "CARE HOMES",
      customerTypeKey: "CARE HOMES",
      productType: "LAUNDRY LIQUIDS",
      productTypeKey: "LAUNDRY LIQUIDS",
    });
    expect(rows[2].productTypeKey).toBe("INCONTINENCE");
  });

  test("a title row is not mistaken for a pairing", () => {
    const rows = parseAreasOfInterestSheet(sheet);
    expect(rows.map((row) => row.customerType)).not.toContain(
      "PRODUCT TYPES OF PARTICULAR INTEREST"
    );
    // The old reader produced rows like { customerType: "LAUNDRY LIQUIDS" } —
    // a product type promoted to a customer type by an off-by-one.
    expect(rows.map((row) => row.customerType)).not.toContain("LAUNDRY LIQUIDS");
  });

  test("also accepts the worksheet once it grows a header row", () => {
    const rows = parseAreasOfInterestSheet([
      ["CUSTOMER TYPE", "PRODUCT TYPE"],
      ["HOTELS", "HAND TOWELS"],
    ]);

    expect(rows).toEqual([
      {
        customerType: "HOTELS",
        customerTypeKey: "HOTELS",
        productType: "HAND TOWELS",
        productTypeKey: "HAND TOWELS",
      },
    ]);
  });

  test("refuses an empty worksheet", () => {
    expect(() =>
      parseAreasOfInterestSheet([["PRODUCT TYPES OF PARTICULAR INTEREST", null]])
    ).toThrow(/Areas of interest/);
  });
});

describe("parseFrequencySheet", () => {
  const sheet: SheetRows = [
    ["Product Category", "Product Type", "Sale Frequency"],
    ["BAGS", "FOOD PREPARATION", "Regular"],
    ["BAGS", "INDOOR BIN LINER", "Regular"],
    ["LIGHT EQUIPMENT ", "BEVERAGE SERVICE", "Sporadic"],
  ];

  test("reads the lookup and normalises both halves of the key", () => {
    const rows = parseFrequencySheet(sheet);

    expect(rows).toHaveLength(3);
    expect(rows[2].productCategory).toBe("LIGHT EQUIPMENT");
    expect(rows[2].productCategoryKey).toBe("LIGHT EQUIPMENT");
    expect(rows[2].frequency).toBe("Sporadic");
  });

  test("a repeated pairing keeps the first, so the lookup stays single-valued", () => {
    const rows = parseFrequencySheet([
      ...sheet,
      ["BAGS", "FOOD PREPARATION", "Sporadic"],
    ]);

    expect(rows).toHaveLength(3);
    expect(rows[0].frequency).toBe("Regular");
  });

  test("refuses a worksheet missing the frequency column", () => {
    expect(() =>
      parseFrequencySheet([
        ["Product Category", "Product Type"],
        ["BAGS", "FOOD PREPARATION"],
      ])
    ).toThrow(/frequency/i);
  });
});

describe("validateSheetMapping", () => {
  test("accepts four distinct worksheets", () => {
    expect(() =>
      validateSheetMapping({ sales: 0, categories: 1, areasOfInterest: 2, frequency: 3 }, 4)
    ).not.toThrow();
  });

  test("refuses the same worksheet chosen twice", () => {
    expect(() =>
      validateSheetMapping({ sales: 0, categories: 0, areasOfInterest: 2, frequency: 3 }, 4)
    ).toThrow(/more than once/);
  });

  test("refuses a worksheet that is not in the workbook", () => {
    expect(() =>
      validateSheetMapping({ sales: 0, categories: 1, areasOfInterest: 2, frequency: 9 }, 4)
    ).toThrow(/not in this workbook/);
  });
});
