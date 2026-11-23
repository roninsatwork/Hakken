import { beforeEach, describe, expect, test, vi } from "vitest";
import { extractPdfTextWithinBudget, MAX_PDF_PAGES } from "./pdfBudget";
import { KNOWLEDGE_WEBSITE_SOURCE_MAX_CHARACTERS } from "../knowledgeImportPolicy";

const pdfParse = vi.hoisted(() => vi.fn());
vi.mock("pdf-extraction", () => ({ default: pdfParse }));

// Braces: a hook that returns a function has it called after the test as clean-up, and mockReset returns the mock.
beforeEach(() => {
  pdfParse.mockReset();
});

describe("PDF page budget", () => {
  test("reads a document at the 500-page limit", async () => {
    const file = Buffer.from("test PDF");
    pdfParse.mockResolvedValue({ numpages: MAX_PDF_PAGES, text: "Last allowed page" });

    await expect(extractPdfTextWithinBudget(file)).resolves.toBe("Last allowed page");
    expect(pdfParse).toHaveBeenCalledWith(file, expect.objectContaining({ max: MAX_PDF_PAGES }));
  });

  test("rejects a longer PDF without using its extracted text", async () => {
    pdfParse.mockResolvedValue({ numpages: MAX_PDF_PAGES + 1, text: "Page 501 private marker" });

    await expect(extractPdfTextWithinBudget(Buffer.from("test PDF"))).rejects.toThrow("more than 500 pages");
  });

  test("reads page text in small pieces and keeps the same line breaks", async () => {
    const streamTextContent = vi.fn(() => new ReadableStream({
      start(controller) {
        controller.enqueue({ items: [{ str: "First line", transform: [0, 0, 0, 0, 0, 10] }] });
        controller.enqueue({ items: [{ str: "Second line", transform: [0, 0, 0, 0, 0, 20] }] });
        controller.close();
      },
    }));
    pdfParse.mockImplementation(async (_file, options) => ({
      numpages: 1,
      text: await options.pagerender({ streamTextContent }),
    }));

    await expect(extractPdfTextWithinBudget(Buffer.from("test PDF"))).resolves.toBe("First line\nSecond line");
    expect(streamTextContent).toHaveBeenCalledWith({ normalizeWhitespace: false, disableCombineTextItems: false });
  });

  test("rejects a very text-heavy knowledge page without reading the rest", async () => {
    let cancelled = false;
    const streamTextContent = () => new ReadableStream({
      start(controller) {
        controller.enqueue({ items: [{ str: "x".repeat(KNOWLEDGE_WEBSITE_SOURCE_MAX_CHARACTERS + 1), transform: [0, 0, 0, 0, 0, 10] }] });
      },
      cancel() { cancelled = true; },
    });
    pdfParse.mockImplementation(async (_file, options) => ({
      numpages: 1,
      text: await options.pagerender({ streamTextContent }),
    }));

    await expect(extractPdfTextWithinBudget(Buffer.from("test PDF"))).rejects.toThrow(
      `Knowledge source exceeds ${KNOWLEDGE_WEBSITE_SOURCE_MAX_CHARACTERS} characters.`,
    );
    expect(cancelled).toBe(true);
  });

  test("keeps the first 50,000 characters for chat without reading the rest", async () => {
    let cancelled = false;
    const streamTextContent = () => new ReadableStream({
      start(controller) {
        controller.enqueue({ items: [{ str: "x".repeat(50_001), transform: [0, 0, 0, 0, 0, 10] }] });
      },
      cancel() { cancelled = true; },
    });
    pdfParse.mockImplementation(async (_file, options) => ({
      numpages: 1,
      text: await options.pagerender({ streamTextContent }),
    }));

    await expect(extractPdfTextWithinBudget(Buffer.from("test PDF"), {
      maxCharacters: 50_000,
      onOverflow: "truncate",
    })).resolves.toBe("x".repeat(50_000));
    expect(cancelled).toBe(true);
  });
});
