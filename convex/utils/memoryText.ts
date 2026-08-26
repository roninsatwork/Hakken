import { getAssistantSafetyWarnings } from "../aiSafetyPolicy";
import { appError } from "./appError";

const MEMORY_CONTENT_MAX_CHARS = 4000;
const MEMORY_TITLE_MAX_CHARS = 120;

/**
 * Tidying the words of a memory, without changing what they say.
 *
 * Pure string work, kept away from the endpoints so that the difference
 * between collapsing a title and preserving a body's line breaks stays
 * readable — that distinction was a real bug once.
 */

export function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Tidy a memory's body without flattening it.
 *
 * This used to run the title's normaliser, which collapses every run of
 * whitespace into a single space — so a memory written as a list of opening
 * hours was stored as one paragraph. Runs of spaces and tabs are still
 * collapsed; line breaks are what the writer meant.
 */
export function normalizeMultilineText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

export function normalizeContent(content: string) {
  const normalizedContent = normalizeMultilineText(content);
  if (normalizedContent.length === 0) throw appError("INVALID_INPUT", "Memory content cannot be empty.");
  if (normalizedContent.length > MEMORY_CONTENT_MAX_CHARS) {
    throw appError("INVALID_INPUT", `Memory content cannot exceed ${MEMORY_CONTENT_MAX_CHARS} characters.`);
  }

  const warnings = getAssistantSafetyWarnings(normalizedContent);
  if (warnings.length > 0) {
    throw appError("INVALID_INPUT", `Memory content rejected by safety policy: ${warnings.map((warning) => warning.category).join(", ")}`);
  }

  return normalizedContent;
}

export function normalizeTitle(title: string | undefined, content: string) {
  const normalizedTitle = normalizeText(title || content.slice(0, MEMORY_TITLE_MAX_CHARS));
  if (normalizedTitle.length === 0) throw appError("INVALID_INPUT", "Memory title cannot be empty.");
  if (normalizedTitle.length > MEMORY_TITLE_MAX_CHARS) {
    throw appError("INVALID_INPUT", `Memory title cannot exceed ${MEMORY_TITLE_MAX_CHARS} characters.`);
  }
  return normalizedTitle;
}

