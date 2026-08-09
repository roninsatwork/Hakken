/**
 * The Open Knowledge Format fields worth carrying into retrieval. The spec
 * requires only `type` and recommends `title` and `description`; producers may
 * add anything else and consumers must tolerate it.
 * https://github.com/GoogleCloudPlatform/knowledge-catalog — okf/SPEC.md
 */
export type OkfFrontmatter = {
  type?: string;
  title?: string;
  description?: string;
};

export type ParsedKnowledgeMarkdown = {
  frontmatter: OkfFrontmatter;
  body: string;
};

const OKF_SCALAR_KEYS = ["type", "title", "description"] as const;

export function isMarkdownFormat(format: string | undefined) {
  if (!format) return false;
  const normalized = format.split(";")[0]?.trim().toLowerCase() ?? "";
  return normalized === "text/markdown" || normalized === "text/x-markdown";
}

function unquoteScalar(value: string) {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  // Strip a trailing `# comment`, but not a `#` inside the text itself.
  const commentIndex = trimmed.search(/\s+#/);
  return (commentIndex === -1 ? trimmed : trimmed.slice(0, commentIndex)).trim();
}

/**
 * Reads the handful of top-level scalar fields we use out of a YAML frontmatter
 * block. Deliberately not a general YAML parser: nested maps, sequences and
 * anchors are skipped rather than interpreted, which is all the spec asks of a
 * consumer. Anything it cannot make sense of leaves the document untouched
 * rather than failing it — a bad header must never cost us the content.
 */
export function parseOkfMarkdown(rawText: string): ParsedKnowledgeMarkdown {
  const text = rawText.replace(/^﻿/, "");
  const lines = text.split(/\r?\n/);

  let openIndex = 0;
  while (openIndex < lines.length && lines[openIndex].trim() === "") openIndex += 1;

  if (lines[openIndex]?.trim() !== "---") {
    return { frontmatter: {}, body: rawText };
  }

  let closeIndex = -1;
  for (let index = openIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line === "---" || line === "...") {
      closeIndex = index;
      break;
    }
  }

  if (closeIndex === -1) {
    // An unterminated block is not frontmatter — treat the whole file as body.
    return { frontmatter: {}, body: rawText };
  }

  const frontmatter: OkfFrontmatter = {};
  const blockLines = lines.slice(openIndex + 1, closeIndex);

  for (let index = 0; index < blockLines.length; index += 1) {
    const line = blockLines[index];
    // Indented lines belong to a nested map or sequence — not ours to read.
    if (/^\s/.test(line) || line.trim() === "" || line.trimStart().startsWith("#")) continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim().toLowerCase();
    if (!OKF_SCALAR_KEYS.includes(key as (typeof OKF_SCALAR_KEYS)[number])) continue;

    const rawValue = line.slice(separator + 1).trim();

    // Block scalars (`|` and `>`) carry their value on the indented lines below.
    if (rawValue === "|" || rawValue === ">" || rawValue === "|-" || rawValue === ">-") {
      const collected: string[] = [];
      let cursor = index + 1;
      while (cursor < blockLines.length && (/^\s+\S/.test(blockLines[cursor]) || blockLines[cursor].trim() === "")) {
        collected.push(blockLines[cursor].trim());
        cursor += 1;
      }
      index = cursor - 1;
      const joined = collected.join(rawValue.startsWith("|") ? "\n" : " ").trim();
      if (joined) frontmatter[key as keyof OkfFrontmatter] = joined;
      continue;
    }

    if (!rawValue) continue;
    const value = unquoteScalar(rawValue);
    if (value) frontmatter[key as keyof OkfFrontmatter] = value;
  }

  return { frontmatter, body: lines.slice(closeIndex + 1).join("\n") };
}

/**
 * A single readable sentence rebuilt from the frontmatter, prepended to the body
 * before chunking so the concept's name and purpose reach the embeddings while
 * the YAML syntax does not.
 */
export function buildKnowledgeLeadLine(frontmatter: OkfFrontmatter) {
  const heading = frontmatter.title && frontmatter.type
    ? `${frontmatter.title} (${frontmatter.type})`
    : frontmatter.title || frontmatter.type || "";

  if (!heading) return frontmatter.description?.trim() ?? "";
  if (!frontmatter.description) return heading;
  return `${heading}: ${frontmatter.description.trim()}`;
}

/**
 * Markdown ready for chunking: frontmatter replaced by the lead line it
 * describes. Non-markdown and plain markdown pass through untouched.
 */
export function prepareKnowledgeMarkdown(rawText: string) {
  const { frontmatter, body } = parseOkfMarkdown(rawText);
  const leadLine = buildKnowledgeLeadLine(frontmatter);
  const trimmedBody = body.trim();

  if (!leadLine) return { text: trimmedBody || rawText, frontmatter };
  if (!trimmedBody) return { text: leadLine, frontmatter };
  return { text: `${leadLine}\n\n${trimmedBody}`, frontmatter };
}

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
