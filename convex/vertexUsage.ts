/**
 * What a Vertex call spent, read from its response for its cost row
 * (`modelSpend.ts`). Apart from `vertexProviderService.ts` so the code that
 * reads a response does not need the client that made it.
 */

/** The parts of Vertex's usage report a cost row reads; the SDK's own type fits it. */
type VertexUsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
};

/** The part of an embedding answer that says how many tokens each text was. */
type VertexEmbedding = { embeddings?: Array<{ statistics?: { tokenCount?: number } }> };

/**
 * A Vertex call's usage as a cost row counts it. Thinking is billed as output
 * but reported apart from `candidatesTokenCount`, so a thinking model's calls
 * read cheaper than they were while only the candidates were counted.
 */
export function vertexUsage(usage: VertexUsageMetadata | undefined) {
  return {
    inputTokens: usage?.promptTokenCount ?? 0,
    outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
    cachedInputTokens: usage?.cachedContentTokenCount ?? 0,
  };
}

/** Roughly four characters a token, for an embedding call Vertex did not count. */
const CHARACTERS_PER_TOKEN = 4;

/** The tokens an embedding call read: Vertex's own count per text, else an estimate from the texts. */
export function embeddingInputTokens(response: VertexEmbedding, texts: readonly string[]): number {
  const counted = (response.embeddings ?? []).reduce((sum, embedding) => sum + (embedding.statistics?.tokenCount ?? 0), 0);
  if (counted > 0) return counted;
  return Math.ceil(texts.reduce((sum, text) => sum + text.length, 0) / CHARACTERS_PER_TOKEN);
}
