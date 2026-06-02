export function chunkKnowledgeText(text: string, chunkSize = 1000, overlap = 200): string[] {
  const cleanedText = text.replace(/\s+/g, " ").trim();
  if (!cleanedText) return [];
  if (chunkSize <= 0) throw new Error("chunkSize must be greater than 0");

  const safeOverlap = Math.max(0, Math.min(overlap, chunkSize - 1));
  const chunks: string[] = [];
  let startIndex = 0;

  while (startIndex < cleanedText.length) {
    let endIndex = Math.min(startIndex + chunkSize, cleanedText.length);

    if (endIndex < cleanedText.length) {
      const boundaryIndex = cleanedText.indexOf(".", Math.max(startIndex, endIndex - 50));
      if (boundaryIndex !== -1 && boundaryIndex - endIndex < 50) {
        endIndex = boundaryIndex + 1;
      }
    }

    chunks.push(cleanedText.substring(startIndex, endIndex));
    if (endIndex >= cleanedText.length) break;

    startIndex = Math.max(endIndex - safeOverlap, startIndex + 1);
  }

  return chunks;
}
