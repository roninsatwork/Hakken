import { beforeEach, describe, expect, test, vi } from "vitest";
import { extractPdfTextWithinBudget, MAX_PDF_PAGES } from "./pdfBudget";

const pdfParse = vi.hoisted(() => vi.fn());
vi.mock("pdf-extraction", () => ({ default: pdfParse }));

beforeEach(() => pdfParse.mockReset());

describe("PDF page budget", () => {
  test("reads a document at the 500-page limit", async () => {
    const file = Buffer.from("test PDF");
    pdfParse.mockResolvedValue({ numpages: MAX_PDF_PAGES, text: "Last allowed page" });

    await expect(extractPdfTextWithinBudget(file)).resolves.toBe("Last allowed page");
    expect(pdfParse).toHaveBeenCalledWith(file, { max: MAX_PDF_PAGES });
  });

  test("rejects a longer PDF without using its extracted text", async () => {
    pdfParse.mockResolvedValue({ numpages: MAX_PDF_PAGES + 1, text: "Page 501 private marker" });

    await expect(extractPdfTextWithinBudget(Buffer.from("test PDF"))).rejects.toThrow("more than 500 pages");
  });
});
