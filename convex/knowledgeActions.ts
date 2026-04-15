"use node";

import { internalAction, action } from "./_generated/server";
import { auth } from "./auth";
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
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    try {
      const doc = await ctx.runQuery(internal.knowledge.getDocInternal, { id: args.documentId });
      if (!doc) throw new Error("Document missing from DB");

      let rawText = "";

      if (doc.textContent) {
          rawText = doc.textContent;
      } else if (args.storageId) {
          const fileUrl = await ctx.storage.getUrl(args.storageId);
          if (!fileUrl) throw new Error("Storage URL missing");

          const response = await fetch(fileUrl);
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          if (doc.format === "application/pdf") {
              const pdfData = await pdfParse(buffer);
              rawText = pdfData.text;
          } else if (doc.format === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
              const result = await mammoth.extractRawText({ buffer });
              rawText = result.value;
          } else {
              rawText = buffer.toString('utf8');
          }
      }

      if (!rawText.trim()) throw new Error("No text content could be extracted from the intelligence file.");

      await embedAndStoreDoc(ctx, args.documentId, doc.companyId, doc.agentId, rawText);

    } catch (error) {
       console.error("Critical Failure in Knowledge Ingestion:", error);
       await ctx.runMutation(internal.knowledge.markDocFailedInternal, { documentId: args.documentId });
    }
  },
});

export const mapWebsite = action({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated request");

    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlKey) throw new Error("FIRECRAWL_API_KEY environment variable not set");

    const response = await fetch("https://api.firecrawl.dev/v1/map", {
       method: "POST",
       headers: {
           "Authorization": `Bearer ${firecrawlKey}`,
           "Content-Type": "application/json"
       },
       body: JSON.stringify({ url: args.url, limit: 500 }) // Cap at 500
    });

    if (!response.ok) {
       const text = await response.text();
       throw new Error(`Firecrawl mapping failed: ${text}`);
    }

    const data = await response.json();
    if (!data.success) throw new Error("Firecrawl mapping unsuccesful");
    return data.links as string[];
  }
});

export const processWebsiteQueue = internalAction({
  args: {},
  handler: async (ctx) => {
     const nextDoc = await ctx.runQuery(internal.knowledge.getNextPendingUrlInternal);
     if (!nextDoc || nextDoc.status !== "pending") return;

     try {
       const firecrawlKey = process.env.FIRECRAWL_API_KEY;
       if (!firecrawlKey) throw new Error("Missing FIRECRAWL_API_KEY");

       const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
           method: "POST",
           headers: {
               "Authorization": `Bearer ${firecrawlKey}`,
               "Content-Type": "application/json"
           },
           body: JSON.stringify({ url: nextDoc.sourceUrl, formats: ["markdown"] })
       });

       if (!response.ok) throw new Error("Scrape failed: " + await response.text());
       const data = await response.json();
       const markdownText = data.data?.markdown || "";

       if (!markdownText) throw new Error("No extracted markdown text from URL.");

       await embedAndStoreDoc(ctx, nextDoc._id, nextDoc.companyId, nextDoc.agentId, markdownText);
     } catch (e) {
       console.error("Queue Scrape Error", e);
       await ctx.runMutation(internal.knowledge.markDocFailedInternal, { documentId: nextDoc._id });
     }

     // Trigger another check after processing to handle queue
     // Decreased from 5000ms to 2000ms to accelerate ingestion without hitting Firecrawl limit walls
     await ctx.scheduler.runAfter(2000, internal.knowledgeActions.processWebsiteQueue);
  }
});

async function embedAndStoreDoc(ctx: any, documentId: string, companyId: any, agentId: any, rawText: string) {
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
         documentId,
         ...(companyId ? { companyId: companyId } : {}),
         ...(agentId ? { agentId: agentId } : {}),
         chunks: embeddedChunks,
      });
}
