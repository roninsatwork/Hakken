/**
 * Cost ceilings for website knowledge ingestion.
 *
 * A company administrator deliberately starts this work, but Firecrawl and
 * embeddings are operator-paid resources. Keep one import useful for a real
 * documentation site while making its worst case finite and reviewable.
 */
export const KNOWLEDGE_WEBSITE_URLS_PER_REQUEST = 100;
export const KNOWLEDGE_WEBSITE_URLS_PER_HOUR = 100;
export const KNOWLEDGE_WEBSITE_MAPS_PER_HOUR = 20;
export const KNOWLEDGE_WEBSITE_REQUEUE_WINDOW_MS = 60 * 60 * 1000;

/** The provider response includes JSON around the extracted markdown. */
export const KNOWLEDGE_WEBSITE_RESPONSE_MAX_BYTES = 512 * 1024;
export const KNOWLEDGE_WEBSITE_SOURCE_MAX_CHARACTERS = 100_000;
export const KNOWLEDGE_WEBSITE_MAX_CHUNKS = 128;
export const KNOWLEDGE_WEBSITE_REQUEST_TIMEOUT_MS = 45_000;
