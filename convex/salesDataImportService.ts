/**
 * Turning the source workbook into rows.
 *
 * Deliberately free of Convex and of exceljs: it takes plain cell values and
 * returns plain objects. Everything interesting about this import is in the
 * shape of the spreadsheet — column headings that are dates, worksheets that
 * label themselves differently, the same category spelled two ways across
 * worksheets — and none of that is worth testing through a file upload.
 *
 * Every worksheet is now a flat table, one source column to one field. The
 * category worksheet used to be a grid of stacked blocks; that reader is gone
 * rather than kept as a fallback, because the failure it produced when the
 * source changed was silent.
 *
 * The rule throughout is to refuse rather than guess. An import that silently
 * reads the wrong column produces a table that looks right and is wrong, and
 * nobody finds out until someone acts on the numbers.
 */

import { ConvexError } from "convex/values";
import type { AppErrorData } from "./utils/appError";

/** A cell as read from the workbook, before we decide what it is. */
export type CellValue = string | number | boolean | Date | null | undefined;
export type SheetRows = CellValue[][];

/**
 * Every sentence below is written for the person who chose the file, and every
 * one of them reached production as "Server Error" until 2026-08-26.
 *
 * These throws leave `startSalesImport` without a try/catch, so production
 * Convex redacted them exactly where the wording mattered most. Extending
 * `ConvexError` is what carries the sentence across the wire — the same escape
 * hatch `appError` uses, kept as a class here because the parsers are pure and
 * the tests assert on the type. `instanceof SalesDataImportError` is unchanged.
 */
export class SalesDataImportError extends ConvexError<AppErrorData> {
  constructor(message: string) {
    super({ code: "INVALID_INPUT", message });
    this.name = "SalesDataImportError";
  }
}

/** The most revenue columns the sales table can hold. See `salesDataRows`. */
export const MAX_PERIOD_COLUMNS = 6;

/**
 * The matching form of a label.
 *
 * The source is inconsistent in three ways that all break a plain string
 * comparison: casing, runs of whitespace including trailing spaces, and
 * `&` against the word `AND` (`DISPENSERS & BRACKETS` on the category
 * worksheet, `DISPENSERS AND BRACKETS` on the sales worksheet). Collapsing all
 * three gives one key both spellings land on.
 *
 * The source text is stored alongside, so nothing here is destructive — this
 * is what we match on, not what we show. The displayed text keeps its own
 * spelling and only loses surrounding whitespace, which is invisible on screen
 * and does nothing but make a column ragged.
 */
export function normalizeKey(value: string): string {
  return value
    .replace(/&/g, " AND ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function cellToString(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    // exceljs hands back objects for rich text and formula cells.
    const candidate = value as { text?: unknown; result?: unknown };
    if (typeof candidate.text === "string") return candidate.text;
    if (candidate.result !== undefined) return String(candidate.result);
    return "";
  }
  return String(value).trim();
}

/**
 * A cell read as a number, or undefined when there is nothing there.
 *
 * Blank is not zero in this source: an empty month means no sale that month,
 * which is a different fact from a sale recorded at zero, and the table should
 * not turn 64% of its cells into £0.00.
 */
function cellToNumber(value: CellValue): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;

  const text = cellToString(value).replace(/[£$,\s]/g, "");
  if (!text) return undefined;

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Whether a row is entirely empty, which is how trailing sheet padding reads. */
function isBlankRow(row: CellValue[] | undefined): boolean {
  if (!row) return true;
  return row.every((cell) => cellToString(cell) === "");
}

// === Sales worksheet ===================================================

/**
 * Which heading means which field.
 *
 * Several aliases each, because the source headings are not stable: the first
 * column arrived as `Customer - Parent  Account  ` with doubled and trailing
 * spaces, and the product code column as `Product - C O L0`, which is an
 * export artefact rather than a name anyone chose.
 */
const SALES_COLUMN_ALIASES: Record<string, string[]> = {
  parentAccount: [
    "CUSTOMER - PARENT ACCOUNT NUMBER",
    "CUSTOMER - PARENT ACCOUNT",
    "PARENT ACCOUNT NUMBER",
    "PARENT ACCOUNT",
  ],
  groupName: ["GROUP NAME", "GROUP"],
  accountName: ["ACCOUNT NAME", "ACCOUNT"],
  customerType: ["CUSTOMER TYPE"],
  productCode: ["PRODUCT - C O L0", "PRODUCT CODE", "PRODUCT"],
  uniqueId: ["UNIQUEID", "UNIQUE ID"],
  productDescription: ["PRODUCT DESCRIPTION", "DESCRIPTION"],
  productCategory: ["PRODUCT CATEGORY", "CATEGORY"],
  productType: ["PRODUCT TYPE", "TYPE"],
};

/** Columns the import cannot proceed without. */
const REQUIRED_SALES_COLUMNS = [
  "parentAccount",
  "groupName",
  "accountName",
  "customerType",
  "productCode",
  "productDescription",
  "productCategory",
  "productType",
] as const;

export type SalesColumnMap = {
  fields: Record<string, number>;
  /** Column indexes of the revenue columns, in sheet order. */
  periodColumns: number[];
  /** What each revenue column was headed, as an ISO month where it is a date. */
  periodLabels: string[];
  quantityColumn?: number;
};

/**
 * A heading that is a month.
 *
 * The revenue columns are not headed `Month 1` — they carry the period itself
 * (`2026-01-01`), which is what lets the import record say which six months
 * the six stored figures were. Excel hands these over as real dates; a text
 * export of the same file gives the ISO string, so both are accepted.
 */
function parseperiodHeading(value: CellValue): string | null {
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  const text = cellToString(value);
  const isoMatch = text.match(/^(\d{4})-(\d{2})(?:-\d{2})?/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`;

  return null;
}

export function mapSalesColumns(headerRow: CellValue[]): SalesColumnMap {
  const fields: Record<string, number> = {};
  const periodColumns: number[] = [];
  const periodLabels: string[] = [];
  let quantityColumn: number | undefined;

  headerRow.forEach((cell, index) => {
    const period = parseperiodHeading(cell);
    if (period) {
      periodColumns.push(index);
      periodLabels.push(period);
      return;
    }

    const heading = normalizeKey(cellToString(cell));
    if (!heading) return;

    // Quantity carries its span in the heading (`Quantity 6m`), so the span
    // must not be part of the match or a twelve-month file loses the column.
    if (heading.startsWith("QUANTITY")) {
      quantityColumn ??= index;
      return;
    }

    for (const [field, aliases] of Object.entries(SALES_COLUMN_ALIASES)) {
      if (field in fields) continue;
      if (aliases.includes(heading)) {
        fields[field] = index;
        return;
      }
    }
  });

  const missing = REQUIRED_SALES_COLUMNS.filter((field) => !(field in fields));
  if (missing.length > 0) {
    const found = headerRow
      .map((cell) => cellToString(cell))
      .filter(Boolean)
      .join(", ");
    throw new SalesDataImportError(
      `The sales worksheet is missing these columns: ${missing.join(", ")}. ` +
        `Headings found: ${found || "none"}.`
    );
  }

  if (periodColumns.length === 0) {
    throw new SalesDataImportError(
      "No revenue columns found on the sales worksheet. Each one needs a date as its heading, such as 2026-01-01."
    );
  }

  if (periodColumns.length > MAX_PERIOD_COLUMNS) {
    throw new SalesDataImportError(
      `The sales worksheet has ${periodColumns.length} revenue columns and this import holds ${MAX_PERIOD_COLUMNS}. ` +
        `Split the file, or ask for the sales table to be extended.`
    );
  }

  return { fields, periodColumns, periodLabels, quantityColumn };
}

export type ParsedSalesRow = {
  /** The line number in the worksheet, so a screen row can be traced back. */
  sourceRow: number;
  parentAccount: string;
  groupName: string;
  accountName: string;
  customerType: string;
  productCode: string;
  uniqueId: string;
  productDescription: string;
  productCategory: string;
  productType: string;
  customerTypeKey: string;
  productCategoryKey: string;
  productTypeKey: string;
  period1?: number;
  period2?: number;
  period3?: number;
  period4?: number;
  period5?: number;
  period6?: number;
  quantity?: number;
  totalRevenue: number;
};

export type ParsedSalesSheet = {
  rows: ParsedSalesRow[];
  periodLabels: string[];
  /** Rows skipped because they carried no product, with their sheet numbers. */
  skippedRowNumbers: number[];
};

export function parseSalesSheet(sheet: SheetRows): ParsedSalesSheet {
  const [headerRow, ...dataRows] = sheet;
  if (!headerRow) {
    throw new SalesDataImportError("The sales worksheet is empty.");
  }

  const columns = mapSalesColumns(headerRow);
  const rows: ParsedSalesRow[] = [];
  const skippedRowNumbers: number[] = [];

  dataRows.forEach((row, index) => {
    if (isBlankRow(row)) return;

    const read = (field: string) => {
      const column = columns.fields[field];
      return column === undefined ? "" : cellToString(row[column]);
    };

    const productCode = read("productCode");
    const accountName = read("accountName");
    if (!productCode && !accountName) {
      // Sheet padding or a stray note, not a sale. Recorded so the import can
      // report it rather than quietly returning fewer rows than the file has.
      skippedRowNumbers.push(index + 2);
      return;
    }

    const periods = columns.periodColumns.map((column) => cellToNumber(row[column]));
    const totalRevenue = periods.reduce<number>(
      (sum, value) => sum + (value ?? 0),
      0
    );

    const parentAccount = read("parentAccount");
    const customerType = read("customerType");
    const productCategory = read("productCategory");
    const productType = read("productType");

    rows.push({
      // +2: past the header row, and back to Excel's one-based numbering.
      sourceRow: index + 2,
      parentAccount,
      groupName: read("groupName"),
      accountName,
      customerType,
      productCode,
      // The export supplies this, but a file without it is still usable —
      // account code plus product code is what it is made of.
      uniqueId: read("uniqueId") || `${parentAccount}${productCode}`,
      productDescription: read("productDescription"),
      productCategory,
      productType,
      customerTypeKey: normalizeKey(customerType),
      productCategoryKey: normalizeKey(productCategory),
      productTypeKey: normalizeKey(productType),
      period1: periods[0],
      period2: periods[1],
      period3: periods[2],
      period4: periods[3],
      period5: periods[4],
      period6: periods[5],
      quantity:
        columns.quantityColumn === undefined
          ? undefined
          : cellToNumber(row[columns.quantityColumn]),
      // Rounded because summing floats read from a spreadsheet produces
      // 1231227.0500000003, and this figure is displayed as money.
      totalRevenue: Math.round(totalRevenue * 100) / 100,
    });
  });

  return { rows, periodLabels: columns.periodLabels, skippedRowNumbers };
}

// === Two-column worksheets =============================================

/**
 * The category and areas-of-interest worksheets.
 *
 * Both are now plain two-column tables — one source column to one field — so
 * one reader serves both. They differ only in how they introduce themselves:
 * the category worksheet has a real header row (`CUSTOMER TYPE`, `CATEGORY`),
 * while the areas-of-interest worksheet has a title row spanning nothing but
 * the first cell and then goes straight into data.
 *
 * The grid reader this replaces walked two stacked blocks, re-read a header
 * row per block, and tracked column positions. When the source became a flat
 * table it did not fail — it read the header row as two customer types and
 * produced 25 rows of confident nonsense. Refusing anything it does not
 * recognise is the whole point of the rewrite.
 */

export type TwoColumnPair = {
  first: string;
  firstKey: string;
  second: string;
  secondKey: string;
};

/**
 * A row that fills only its first cell, which is how a worksheet titles
 * itself. Skipped wherever it appears, since it carries no pairing.
 */
function isTitleRow(row: CellValue[]): boolean {
  const first = cellToString(row[0]);
  if (!first) return false;
  return row.slice(1).every((cell) => cellToString(cell) === "");
}

function looksLikeHeading(value: string, aliases: string[]): boolean {
  return aliases.includes(normalizeKey(value));
}

/**
 * Read a two-column worksheet into pairs.
 *
 * `headings` names what the two columns are called when the worksheet labels
 * them. A matching row is consumed as the header; a worksheet without one is
 * read from its first populated row, which is what the areas-of-interest tab
 * needs.
 */
export function parseTwoColumnSheet(
  sheet: SheetRows,
  options: {
    label: string;
    firstHeadings: string[];
    secondHeadings: string[];
  }
): TwoColumnPair[] {
  const pairs: TwoColumnPair[] = [];
  const seen = new Set<string>();

  for (const row of sheet) {
    if (isBlankRow(row)) continue;
    if (isTitleRow(row)) continue;

    const first = cellToString(row[0]);
    const second = cellToString(row[1]);

    // The header row, wherever it sits. Matching on both cells rather than one
    // avoids eating a data row that happens to start with the word "category".
    if (
      looksLikeHeading(first, options.firstHeadings) &&
      looksLikeHeading(second, options.secondHeadings)
    ) {
      continue;
    }

    if (!first || !second) continue;

    const firstKey = normalizeKey(first);
    const secondKey = normalizeKey(second);
    // The source repeats pairings; storing each once keeps a filter list from
    // showing duplicates.
    const dedupeKey = `${firstKey}|${secondKey}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    pairs.push({ first, firstKey, second, secondKey });
  }

  if (pairs.length === 0) {
    throw new SalesDataImportError(
      `No rows were found on the worksheet mapped to ${options.label}. ` +
        `It needs two columns: the customer type, then the value. Check the mapping.`
    );
  }

  return pairs;
}

export type ParsedCategoryLink = {
  customerType: string;
  customerTypeKey: string;
  category: string;
  categoryKey: string;
};

export function parseCategorySheet(sheet: SheetRows): ParsedCategoryLink[] {
  return parseTwoColumnSheet(sheet, {
    label: "Categories",
    firstHeadings: ["CUSTOMER TYPE", "CUSTOMER"],
    secondHeadings: ["CATEGORY", "PRODUCT CATEGORY", "CATEGORIES"],
  }).map((pair) => ({
    customerType: pair.first,
    customerTypeKey: pair.firstKey,
    category: pair.second,
    categoryKey: pair.secondKey,
  }));
}

export type ParsedAreaOfInterest = {
  customerType: string;
  customerTypeKey: string;
  productType: string;
  productTypeKey: string;
};

export function parseAreasOfInterestSheet(sheet: SheetRows): ParsedAreaOfInterest[] {
  return parseTwoColumnSheet(sheet, {
    label: "Areas of interest",
    firstHeadings: ["CUSTOMER TYPE", "CUSTOMER"],
    secondHeadings: ["PRODUCT TYPE", "PRODUCT TYPES", "AREA OF INTEREST", "INTEREST"],
  }).map((pair) => ({
    customerType: pair.first,
    customerTypeKey: pair.firstKey,
    productType: pair.second,
    productTypeKey: pair.secondKey,
  }));
}

// === Frequency worksheet ===============================================

export type ParsedFrequency = {
  productCategory: string;
  productType: string;
  frequency: string;
  productCategoryKey: string;
  productTypeKey: string;
};

const FREQUENCY_COLUMN_ALIASES: Record<string, string[]> = {
  productCategory: ["PRODUCT CATEGORY", "CATEGORY"],
  productType: ["PRODUCT TYPE", "TYPE"],
  frequency: ["SALE FREQUENCY", "FREQUENCY", "SALES FREQUENCY"],
};

export function parseFrequencySheet(sheet: SheetRows): ParsedFrequency[] {
  const [headerRow, ...dataRows] = sheet;
  if (!headerRow) {
    throw new SalesDataImportError("The worksheet mapped to Sales frequency is empty.");
  }

  const columns: Record<string, number> = {};
  headerRow.forEach((cell, index) => {
    const heading = normalizeKey(cellToString(cell));
    for (const [field, aliases] of Object.entries(FREQUENCY_COLUMN_ALIASES)) {
      if (field in columns) continue;
      if (aliases.includes(heading)) columns[field] = index;
    }
  });

  const missing = Object.keys(FREQUENCY_COLUMN_ALIASES).filter(
    (field) => !(field in columns)
  );
  if (missing.length > 0) {
    throw new SalesDataImportError(
      `The worksheet mapped to Sales frequency is missing these columns: ${missing.join(", ")}.`
    );
  }

  const rows: ParsedFrequency[] = [];
  const seen = new Set<string>();

  for (const row of dataRows) {
    if (isBlankRow(row)) continue;

    const productCategory = cellToString(row[columns.productCategory]);
    const productType = cellToString(row[columns.productType]);
    const frequency = cellToString(row[columns.frequency]);
    if (!productCategory && !productType) continue;

    const productCategoryKey = normalizeKey(productCategory);
    const productTypeKey = normalizeKey(productType);
    // This worksheet is a lookup, so a repeated pairing is a source mistake
    // rather than data. Keeping the first means the lookup stays single-valued.
    const dedupeKey = `${productCategoryKey}|${productTypeKey}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    rows.push({
      productCategory,
      productType,
      frequency,
      productCategoryKey,
      productTypeKey,
    });
  }

  if (rows.length === 0) {
    throw new SalesDataImportError(
      "No rows were found on the worksheet mapped to Sales frequency. Check the mapping."
    );
  }

  return rows;
}

/**
 * Check a mapping before anything is read.
 *
 * The user picks which worksheet is which at upload, so the two mistakes worth
 * catching up front are an index that is not in the workbook and the same
 * worksheet chosen twice.
 */
export type SheetMapping = {
  sales: number;
  categories: number;
  areasOfInterest: number;
  frequency: number;
};

export function validateSheetMapping(
  mapping: SheetMapping,
  worksheetCount: number
): void {
  const entries = Object.entries(mapping);

  for (const [name, index] of entries) {
    if (!Number.isInteger(index) || index < 0 || index >= worksheetCount) {
      throw new SalesDataImportError(
        `The worksheet chosen for ${name} is not in this workbook.`
      );
    }
  }

  const chosen = new Set(entries.map(([, index]) => index));
  if (chosen.size !== entries.length) {
    throw new SalesDataImportError(
      `Each of the ${entries.length} datasets needs its own worksheet. The same one has been chosen more than once.`
    );
  }
}
