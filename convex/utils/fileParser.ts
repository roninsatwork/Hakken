"use node";

import { GenericActionCtx } from "convex/server";
import { Id } from "../_generated/dataModel";
// @ts-ignore
import pdfExtraction from "pdf-extraction";
import * as xlsx from "xlsx";
import mammoth from "mammoth";

export async function parseDocuments(ctx: GenericActionCtx<any>, fileIds: Id<"_storage">[]): Promise<string> {
  if (!fileIds || fileIds.length === 0) return "";

  let compiledTexts = "";

  for (let i = 0; i < fileIds.length; i++) {
    const fileId = fileIds[i];
    try {
      const blob = await ctx.storage.get(fileId);
      if (!blob) continue;

      const mimeType = blob.type;
      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

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
           const workbook = xlsx.read(buffer, { type: "buffer" });
           // Extract text from the first sheet
           if (workbook.SheetNames.length > 0) {
              const firstSheetName = workbook.SheetNames[0];
              const worksheet = workbook.Sheets[firstSheetName];
              extractedText = xlsx.utils.sheet_to_csv(worksheet, { strip: true, blankrows: false });
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
