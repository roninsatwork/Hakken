// @ts-expect-error pdf-extraction ships incomplete TypeScript declarations.
import pdfExtraction from "pdf-extraction";
import { appError } from "./appError";

export const MAX_PDF_PAGES = 500;
export const PDF_TOO_LONG_MESSAGE = "PDF has more than 500 pages. Please upload a shorter file.";

/** Read at most 500 pages, and reject a longer file instead of silently losing pages. */
export async function extractPdfTextWithinBudget(buffer: Buffer): Promise<string> {
  const parsed = await pdfExtraction(buffer, { max: MAX_PDF_PAGES }) as { numpages: number; text: string };
  if (parsed.numpages > MAX_PDF_PAGES) throw appError("INVALID_INPUT", PDF_TOO_LONG_MESSAGE);
  return parsed.text;
}
