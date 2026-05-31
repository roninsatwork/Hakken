"use node";

import { GenericActionCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
// @ts-expect-error pdf-extraction ships incomplete TypeScript declarations.
import pdfExtraction from "pdf-extraction";
import * as ExcelJS from "exceljs";
import mammoth from "mammoth";

export async function parseDocuments(ctx: GenericActionCtx<DataModel>, fileIds: Id<"_storage">[]): Promise<string> {
  if (!fileIds || fileIds.length === 0) return "";

  let compiledTexts = "";

  for (let i = 0; i < fileIds.length; i++) {
    const fileId = fileIds[i];
    try {
      const blob = await ctx.storage.get(fileId);
      if (!blob) continue;

      const mimeType = blob.type;
      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer) as Buffer;

      let extractedText = "";

      if (mimeType === "application/pdf") {
        try {
           const pdfData = await pdfExtraction(buffer);
           extractedText = pdfData.text;
        } catch (e) {
           console.error("PDF Parsing error:", e);
           extractedText = "[Failed to extract exact text from PDF. It may be heavily styled or encrypted.]";
        }
      } else if (
        mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || 
        mimeType === "application/vnd.ms-excel"
      ) {
         try {
           const workbook = new ExcelJS.Workbook();
           await workbook.xlsx.load(arrayBuffer);
           // Extract text from the first sheet
           if (workbook.worksheets.length > 0) {
              const worksheet = workbook.worksheets[0];
              const rows: string[] = [];
              worksheet.eachRow((row) => {
                 rows.push(row.values.toString());
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
           const result = await mammoth.extractRawText({ buffer });
           extractedText = result.value;
         } catch (e) {
           console.error("Docx Parsing error:", e);
           extractedText = "[Failed to read Word document.]";
         }
      } else if (mimeType.startsWith("text/")) {
         // This covers CSV, txt
         extractedText = buffer.toString("utf-8");
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
