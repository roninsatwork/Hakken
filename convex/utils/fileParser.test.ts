import ExcelJS from "exceljs";
import { strToU8, zipSync } from "fflate";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { parseDocuments } from "./fileParser";
import { assertOfficeArchiveBudget } from "./officeArchiveBudget";

const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const pdfExtraction = vi.hoisted(() => vi.fn());
vi.mock("pdf-extraction", () => ({ default: pdfExtraction }));

beforeEach(() => pdfExtraction.mockReset());

function blobFor(text: string, type: string) {
  return new Blob([text], { type });
}

async function xlsxBlobFor(rows: Array<Array<string | number>>) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  for (const row of rows) sheet.addRow(row);
  return new Blob([await workbook.xlsx.writeBuffer()], { type: XLSX_MIME_TYPE });
}

describe("file parser", () => {
  test("rejects a PDF beyond 500 pages and keeps a PDF at the limit readable", async () => {
    const pdf = new Blob(["dummy PDF"], { type: "application/pdf" });
    const ctx = { storage: { get: vi.fn(async () => pdf) } };
    pdfExtraction.mockResolvedValueOnce({ numpages: 501, text: "Page 501 marker" });
    const tooLong = await parseDocuments(ctx as never, ["long-pdf" as never]);
    expect(tooLong).toContain("more than 500 pages");
    expect(tooLong).not.toContain("Page 501 marker");

    pdfExtraction.mockResolvedValueOnce({ numpages: 500, text: "Page 500 is readable" });
    const allowed = await parseDocuments(ctx as never, ["allowed-pdf" as never]);
    expect(allowed).toContain("Page 500 is readable");
  });

  test("rejects an office archive whose small upload expands beyond the parser budget", async () => {
    const compressed = zipSync({ "word/document.xml": strToU8("x".repeat(1_000_000)) });
    expect(compressed.length).toBeLessThan(10_000);
    expect(() => assertOfficeArchiveBudget(compressed, 100_000)).toThrow("expanded");
    const falseHeader = compressed.slice();
    new DataView(falseHeader.buffer).setUint32(22, 1, true);
    expect(() => assertOfficeArchiveBudget(falseHeader, 100_000)).toThrow("expanded");

    const valid = await xlsxBlobFor([["Region", "Revenue"], ["London", 1234]]);
    const validBytes = new Uint8Array(await valid.arrayBuffer());
    expect(() => assertOfficeArchiveBudget(validBytes)).not.toThrow();
  });

  test("returns empty text for missing file ids and compiles plain text uploads", async () => {
    expect(await parseDocuments({ storage: { get: vi.fn() } } as never, [])).toBe("");

    const ctx = {
      storage: {
        get: vi.fn(async () => blobFor("hello from upload", "text/plain")),
      },
    };

    await expect(parseDocuments(ctx as never, ["storage-id" as never])).resolves.toContain("hello from upload");
    expect(ctx.storage.get).toHaveBeenCalledWith("storage-id");
  });

  test("skips missing blobs, reports unsupported files, and keeps processing after storage errors", async () => {
    const ctx = {
      storage: {
        get: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(blobFor("binary", "application/octet-stream"))
          .mockRejectedValueOnce(new Error("storage failed")),
      },
    };

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await parseDocuments(ctx as never, ["missing" as never, "unsupported" as never, "broken" as never]);

    expect(result).toContain("Unsupported document type uploaded: application/octet-stream");
    expect(consoleError).toHaveBeenCalledWith("Failed to process document broken:", expect.any(Error));
    consoleError.mockRestore();
  });

  // Guards the pinned `exceljs` transitive overrides in package.json
  // (archiver@8 / unzipper@0.12, taken to clear the production audit gate).
  // The xlsx branch in parseDocuments swallows parser failures into a
  // placeholder string, so a broken zip dependency would regress silently
  // rather than throw. Assert on real extracted content, not just absence of
  // an exception.
  test("extracts real cell content from an xlsx upload", async () => {
    const blob = await xlsxBlobFor([
      ["Region", "Revenue"],
      ["London", 1234],
      ["Milan", 5678],
    ]);

    const ctx = { storage: { get: vi.fn(async () => blob) } };
    const result = await parseDocuments(ctx as never, ["sheet" as never]);

    expect(result).not.toContain("[Failed to read Excel workbook.]");
    expect(result).not.toContain("[Excel workbook was empty]");
    expect(result).toContain("Region");
    expect(result).toContain("London");
    expect(result).toContain("5678");
  });
});
