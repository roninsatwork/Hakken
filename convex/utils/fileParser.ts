"use node";

import { GenericActionCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import * as ExcelJSNamespace from "exceljs";
import mammoth from "mammoth";
import { assertOfficeArchiveBudget } from "./officeArchiveBudget";
import { appErrorMessage } from "./appError";
import { extractPdfTextWithinBudget, PDF_TOO_LONG_MESSAGE } from "./pdfBudget";

/**
 * exceljs, whichever shape the bundler hands over.
 *
 * The package is plain CommonJS, so a namespace import lands either on its
 * exports or on a wrapper holding them under `default`. Convex's bundler does
 * the latter, which makes a bare `new ExcelJS.Workbook()` throw
 * `_.Workbook is not a constructor` at run time despite typechecking cleanly.
 *
 * This path had the same latent fault as the sales data importer, where it was
 * found: any spreadsheet uploaded as a knowledge document would have failed to
 * parse and been recorded as unreadable.
 */
const ExcelJS =
  (ExcelJSNamespace as unknown as { default?: typeof ExcelJSNamespace }).default ??
  ExcelJSNamespace;

export async function parseDocuments(ctx: GenericActionCtx<DataModel>, fileIds: Id<"_storage">[]): Promise<string> {
  if (!fileIds || fileIds.length === 0) return "";

  let compiledTexts = "";

  for (const [i, fileId] of [...new Set(fileIds)].slice(0, 10).entries()) {
    try {
      const blob = await ctx.storage.get(fileId);
      if (!blob) continue;

      const mimeType = blob.type;
      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer) as Buffer;

      let extractedText = "";

      if (mimeType === "application/pdf") {
        try {
           extractedText = await extractPdfTextWithinBudget(buffer);
        } catch (e) {
           if (appErrorMessage(e, "") === PDF_TOO_LONG_MESSAGE) {
             extractedText = `[${PDF_TOO_LONG_MESSAGE}]`;
           } else {
             console.error("PDF Parsing error:", e);
             extractedText = "[Failed to extract exact text from PDF. It may be heavily styled or encrypted.]";
           }
        }
      } else if (
        mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || 
        mimeType === "application/vnd.ms-excel"
      ) {
         try {
           assertOfficeArchiveBudget(new Uint8Array(arrayBuffer));
           const workbook = new ExcelJS.Workbook();
           await workbook.xlsx.load(arrayBuffer);
           // Extract text from the first sheet
           if (workbook.worksheets.length > 0) {
              const worksheet = workbook.worksheets[0];
              const rows: string[] = [];
              let rowCharacters = 0;
              worksheet.eachRow((row) => {
                 if (rowCharacters >= 50000) return;
                 const value = row.values.toString();
                 rows.push(value.substring(0, 50000 - rowCharacters));
                 rowCharacters += value.length + 1;
              });
              extractedText = rows.join('\n');
           } else {
              extractedText = "[Excel workbook was empty]";
           }
         } catch (e) {
           console.error("Excel Parsing error:", e);
           extractedText = "[Failed to read Excel workbook.]";
         }
      } else if (
        mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
         try {
           assertOfficeArchiveBudget(new Uint8Array(arrayBuffer));
           const result = await mammoth.extractRawText({ buffer });
           extractedText = result.value;
         } catch (e) {
           console.error("Docx Parsing error:", e);
           extractedText = "[Failed to read Word document.]";
         }
      } else if (mimeType.startsWith("text/")) {
         // This covers CSV, txt
         extractedText = buffer.subarray(0, 200000).toString("utf-8");
      } else {
         extractedText = `[Unsupported document type uploaded: ${mimeType}]`;
      }

      compiledTexts += `\n\n--- DOCUMENT ${i + 1} (${mimeType}) ---\n${extractedText.substring(0, 50000)}\n`; // Cap at 50,000 characters per doc to protect context window limits

    } catch (err) {
      console.error(`Failed to process document ${fileId}:`, err);
    }
  }

  return compiledTexts;
}
