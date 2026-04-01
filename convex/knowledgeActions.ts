"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { GoogleGenAI } from "@google/genai";
// @ts-ignore
import pdfParse from "pdf-extraction";
import mammoth from "mammoth";

function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  const chunks: string[] = [];
  let startIndex = 0;

  const cleanedText = text.replace(/\s+/g, ' ').trim();

  while (startIndex < cleanedText.length) {
    let endIndex = startIndex + chunkSize;

    if (endIndex < cleanedText.length) {
      const boundaryIndex = cleanedText.indexOf('.', endIndex - 50);
      if (boundaryIndex !== -1 && boundaryIndex - endIndex < 50) {
          endIndex = boundaryIndex + 1;
      }
    }

    chunks.push(cleanedText.substring(startIndex, endIndex));
    startIndex = endIndex - overlap; 
  }

  return chunks;
}

export const ingestDocument = internalAction({
  args: {
    documentId: v.id("knowledgeDocuments"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    try {
      const doc = await ctx.runQuery(internal.knowledge.getDocInternal, { id: args.documentId });
      if (!doc) throw new Error("Document missing from DB");

      const fileUrl = await ctx.storage.getUrl(args.storageId);
      if (!fileUrl) throw new Error("Storage URL missing");

      const response = await fetch(fileUrl);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      let rawText = "";

      if (doc.format === "application/pdf") {
          const pdfData = await pdfParse(buffer);
          rawText = pdfData.text;
      } else if (doc.format === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
          const result = await mammoth.extractRawText({ buffer });
          rawText = result.value;
      } else {
          rawText = buffer.toString('utf8');
      }

      if (!rawText.trim()) throw new Error("No text content could be extracted from the intelligence file.");

      const chunks = chunkText(rawText);

      const projectId = process.env.GOOGLE_CLOUD_PROJECT || "sonae-dev-491717";
      const location = process.env.GOOGLE_CLOUD_LOCATION || "global";
      
      const ai = new GoogleGenAI({ 
        project: projectId, 
        location: location,
        vertexai: true,
        googleAuthOptions: {
          credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          }
        }
      });

      const embeddedChunks = [];
      for (const textChunk of chunks) {
         try {
             const embedResponse = await ai.models.embedContent({
                 model: "text-embedding-004", 
                 contents: textChunk,
             });
             
             if (embedResponse.embeddings && embedResponse.embeddings.length > 0) {
                const vector = embedResponse.embeddings[0].values;
                if (vector && vector.length === 768) {
                   embeddedChunks.push({
                      text: textChunk,
                      embedding: vector
                   });
                }
             }
         } catch (e) {
            console.error("Vector Embed Failure on chunk", e);
         }
      }

      await ctx.runMutation(internal.knowledge.saveChunksInternal, {
         documentId: args.documentId,
         ...(doc.companyId ? { companyId: doc.companyId } : {}),
         ...(doc.agentId ? { agentId: doc.agentId } : {}),
         chunks: embeddedChunks,
      });

    } catch (error) {
       console.error("Critical Failure in Knowledge Ingestion:", error);
       await ctx.runMutation(internal.knowledge.markDocFailedInternal, { documentId: args.documentId });
    }
  },
});
