export type WebsiteDocumentGroupItem = {
  format: string;
  sourceUrl?: string;
};

export function groupWebsiteDocuments<TDocument extends WebsiteDocumentGroupItem>(documents: TDocument[] | undefined) {
  const groups: Record<string, TDocument[]> = {};
  if (!documents) return groups;

  for (const document of documents) {
    if (document.format !== "url" || !document.sourceUrl) continue;

    try {
      const root = new URL(document.sourceUrl).origin;
      groups[root] = [...(groups[root] ?? []), document];
    } catch {
      groups.Other = [...(groups.Other ?? []), document];
    }
  }

  return groups;
}
