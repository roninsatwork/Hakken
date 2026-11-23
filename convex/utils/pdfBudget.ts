"use node";

// @ts-expect-error pdf-extraction ships incomplete TypeScript declarations.
import pdfExtraction from "pdf-extraction";
import { appError } from "./appError";
import { KNOWLEDGE_WEBSITE_SOURCE_MAX_CHARACTERS } from "../knowledgeImportPolicy";

export const MAX_PDF_PAGES = 500;
export const PDF_TOO_LONG_MESSAGE = "PDF has more than 500 pages. Please upload a shorter file.";

/**
 * How much text a PDF may give. A knowledge import rejects a PDF past its limit (the same limit and words as
 * `embedAndStoreDoc`), and chat keeps the first part. Either way the rest is never read.
 */
export type PdfTextBudget = { maxCharacters?: number; onOverflow?: "reject" | "truncate" };

type PdfTextItem = { str: string; transform: number[] };
type PdfPage = {
  streamTextContent: (options: { normalizeWhitespace: boolean; disableCombineTextItems: boolean }) => ReadableStream<{ items: PdfTextItem[] }>;
};

/** pdf-extraction joins its pages with a blank line between each. */
const PAGE_BREAK = 2;

/**
 * Read at most 500 pages, and reject a longer file instead of silently losing pages. Each page's text is read in
 * small pieces, with the line breaks pdf-extraction's own reader gives, and reading stops at the character budget,
 * so a very text-heavy PDF never sits whole in memory.
 */
export async function extractPdfTextWithinBudget(buffer: Buffer, budget: PdfTextBudget = {}): Promise<string> {
  const maxCharacters = budget.maxCharacters ?? KNOWLEDGE_WEBSITE_SOURCE_MAX_CHARACTERS;
  const onOverflow = budget.onOverflow ?? "reject";
  const tooLong = () => appError("INVALID_INPUT", `Knowledge source exceeds ${maxCharacters} characters.`);
  let read = 0;
  let full = false;

  const pagerender = async (page: PdfPage): Promise<string> => {
    if (full) return "";
    const reader = page.streamTextContent({ normalizeWhitespace: false, disableCombineTextItems: false }).getReader();
    let text = "";
    let lastY: number | undefined;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const item of value.items) {
        const y = item.transform[5];
        // As pdf-extraction's own page reader: a new line wherever the text moves down the page.
        const piece = lastY === y || !lastY ? item.str : `\n${item.str}`;
        lastY = y;
        if (read + text.length + piece.length > maxCharacters) {
          await reader.cancel();
          if (onOverflow === "reject") throw tooLong();
          text += piece.slice(0, Math.max(0, maxCharacters - read - text.length));
          full = true;
          read += text.length;
          return text;
        }
        text += piece;
      }
    }
    read += text.length + PAGE_BREAK;
    return text;
  };

  const parsed = await pdfExtraction(buffer, { max: MAX_PDF_PAGES, pagerender }) as { numpages: number; text: string };
  if (parsed.numpages > MAX_PDF_PAGES) throw appError("INVALID_INPUT", PDF_TOO_LONG_MESSAGE);
  if (parsed.text.length <= maxCharacters) return parsed.text;
  if (onOverflow === "reject") throw tooLong();
  return parsed.text.slice(0, maxCharacters);
}
