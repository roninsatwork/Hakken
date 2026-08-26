import { appError } from "./appError";
import { stableStringify } from "./lang";
import { SKILL_MARKDOWN_LIMIT, SKILL_TEXT_LIMIT } from "./skillContracts";
import type {
  MarkdownSkillDraft,
  ParsedMarkdownSection,
  SkillRiskLevel,
} from "./skillContracts";
import { hashString, normalizeCategory } from "./skillNormalization";

export function normalizeHeadingTitle(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function parseSimpleFrontmatter(markdown: string) {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { frontmatter: {} as Record<string, string>, body: normalized };
  }
  const endIndex = normalized.indexOf("\n---", 4);
  if (endIndex === -1) {
    return { frontmatter: {} as Record<string, string>, body: normalized };
  }
  const frontmatterText = normalized.slice(4, endIndex);
  const frontmatter: Record<string, string> = {};
  for (const line of frontmatterText.split("\n")) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.+)$/.exec(line.trim());
    if (!match) continue;
    frontmatter[match[1].trim().toLowerCase()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return {
    frontmatter,
    body: normalized.slice(endIndex + 4).replace(/^\n+/, ""),
  };
}

export function splitMarkdownSections(markdown: string) {
  const sections: ParsedMarkdownSection[] = [];
  const headingMatches = Array.from(markdown.matchAll(/^#{1,6}\s+(.+)$/gm));
  if (headingMatches.length === 0) return sections;

  for (let index = 0; index < headingMatches.length; index += 1) {
    const match = headingMatches[index];
    const next = headingMatches[index + 1];
    const title = match[1].trim().replace(/\s+#+$/, "");
    const start = (match.index ?? 0) + match[0].length;
    const end = next?.index ?? markdown.length;
    sections.push({
      title,
      normalizedTitle: normalizeHeadingTitle(title),
      body: markdown.slice(start, end).trim(),
    });
  }
  return sections;
}

export function findSection(sections: ParsedMarkdownSection[], patterns: string[]) {
  return sections.find((section) => patterns.some((pattern) => section.normalizedTitle.includes(pattern)));
}

export function findSections(sections: ParsedMarkdownSection[], patterns: string[]) {
  return sections.filter((section) => patterns.some((pattern) => section.normalizedTitle.includes(pattern)));
}

export function stripMarkdownNoise(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[a-zA-Z0-9_-]*\n?|\n?```/g, ""))
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*> ?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

export function getOpeningParagraph(markdown: string) {
  const withoutHeading = markdown.replace(/^#\s+.+$/m, "").trim();
  const beforeNextHeading = withoutHeading.split(/\n#{1,6}\s+/)[0]?.trim() ?? "";
  const paragraphs = beforeNextHeading.split(/\n\s*\n/).map((entry) => stripMarkdownNoise(entry)).filter(Boolean);
  return paragraphs.find((paragraph) => paragraph.length > 0 && paragraph.length <= 500);
}

export function getMarkdownTitle(markdown: string) {
  const match = /^#\s+(.+)$/m.exec(markdown);
  return match?.[1].trim().replace(/\s+#+$/, "");
}

export function getFrontmatterRisk(value: string | undefined) {
  const normalized = value?.trim().toUpperCase();
  return normalized === "LOW" || normalized === "MEDIUM" || normalized === "HIGH" ? normalized : undefined;
}

export function inferRiskLevel(markdown: string, frontmatterRisk?: SkillRiskLevel): SkillRiskLevel {
  if (frontmatterRisk) return frontmatterRisk;
  const lower = markdown.toLowerCase();
  if (/\b(delete|destructive|payment|send email|send message|external system|write access|approval required|requires approval|human approval|side effect)\b/.test(lower)) {
    return "HIGH";
  }
  if (/\b(tool|connector|api|webhook|upload|download|customer|client|compliance|legal|risk)\b/.test(lower)) {
    return "MEDIUM";
  }
  return "LOW";
}

export function extractToolHints(sections: ParsedMarkdownSection[]) {
  const requiredSections = findSections(sections, ["required tool", "required connector", "required mcp", "dependencies"]);
  const recommendedSections = findSections(sections, ["tool", "connector", "mcp"]);
  const required = extractToolNames(requiredSections.map((section) => section.body).join("\n"));
  const recommended = extractToolNames(recommendedSections
    .filter((section) => !requiredSections.includes(section))
    .map((section) => section.body)
    .join("\n"));
  return {
    required,
    recommended: recommended.filter((mapping) => !required.includes(mapping)),
  };
}

export function extractToolNames(value: string) {
  if (!value.trim()) return [];
  const candidates = new Set<string>();
  for (const match of value.matchAll(/`([^`]+)`/g)) {
    const candidate = match[1].trim();
    if (candidate) candidates.add(candidate);
  }
  for (const line of value.split("\n")) {
    const normalized = stripMarkdownNoise(line).trim();
    if (!normalized || normalized.length > 120) continue;
    const firstToken = normalized.split(/\s+-\s+|\s+--\s+|:\s+|\s+\(/)[0]?.trim();
    if (firstToken && /^[a-zA-Z0-9_.:/-]{3,}$/.test(firstToken)) candidates.add(firstToken);
  }
  return Array.from(candidates)
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length <= 120)
    .slice(0, 50);
}

export function buildInstructionFromMarkdown(markdown: string, sections: ParsedMarkdownSection[]) {
  const instructionPatterns = ["instruction", "workflow", "process", "steps", "how to use", "behavior", "guidance", "rules"];
  const excludedPatterns = ["example", "eval", "test", "tool", "connector", "mcp", "dependency", "setup", "install"];
  const directSections = findSections(sections, instructionPatterns);
  const sourceSections = directSections.length > 0
    ? directSections
    : sections.filter((section) => !excludedPatterns.some((pattern) => section.normalizedTitle.includes(pattern)));
  const source = sourceSections.length > 0
    ? sourceSections.map((section) => `## ${section.title}\n${section.body}`).join("\n\n")
    : markdown.replace(/^#\s+.+$/m, "").trim();
  return stripMarkdownNoise(source).slice(0, SKILL_TEXT_LIMIT).trim();
}

export function buildEvalFixturesFromMarkdown(name: string, sections: ParsedMarkdownSection[]) {
  const exampleSection = findSection(sections, ["example", "eval", "test"]);
  if (!exampleSection?.body.trim()) return [];
  return [{
    type: "HAPPY_PATH",
    objective: `Validate the imported ${name} skill against its documented examples.`,
    expectedFinalOutputRubric: "The response should follow the imported skill instructions, preserve stated constraints, and produce the behavior demonstrated by the source examples.",
    tags: ["imported", "skill-md"],
  }];
}

export function parseSkillMarkdown(markdown: string, filename?: string): MarkdownSkillDraft {
  const trimmedMarkdown = markdown.trim();
  if (!trimmedMarkdown) throw appError("INVALID_INPUT", "SKILL.md content is required.");
  if (trimmedMarkdown.length > SKILL_MARKDOWN_LIMIT) {
    throw appError("INVALID_INPUT", `SKILL.md content cannot exceed ${SKILL_MARKDOWN_LIMIT} characters.`);
  }
  const { frontmatter, body } = parseSimpleFrontmatter(trimmedMarkdown);
  const sections = splitMarkdownSections(body);
  const name = frontmatter.name || getMarkdownTitle(body) || "";
  const descriptionSection = findSection(sections, ["description", "summary", "overview"]);
  const description = frontmatter.description
    || (descriptionSection ? stripMarkdownNoise(descriptionSection.body).split(/\n\s*\n/)[0]?.trim() : undefined)
    || getOpeningParagraph(body);
  const toolHints = extractToolHints(sections);
  const riskLevel = inferRiskLevel(body, getFrontmatterRisk(frontmatter.risklevel || frontmatter.risk_level || frontmatter.risk));
  const instruction = buildInstructionFromMarkdown(body, sections);
  const category = normalizeCategory(frontmatter.category || "IMPORTED");
  const suggestedEvalFixtures = buildEvalFixturesFromMarkdown(name || "skill", sections);
  const warnings: string[] = [];
  const errors: string[] = [];
  const suggestions: string[] = [];

  if (!name.trim()) errors.push("Missing skill name. Add a frontmatter name or first-level heading.");
  if (!instruction.trim()) errors.push("Missing durable skill instruction content.");
  if (!description) warnings.push("No description was found. Add a short description before publishing.");
  if (suggestedEvalFixtures.length === 0) {
    warnings.push("No examples or eval fixtures were found.");
    suggestions.push("Add at least two starter eval fixtures before marking the skill production-ready.");
  }
  if (riskLevel === "HIGH" && !/\b(approval|required approval|human approval|pause|confirm)\b/i.test(body)) {
    warnings.push("High-risk language was detected without explicit approval guidance.");
    suggestions.push("Add approval handoff language for side-effecting actions.");
  }
  if (/\b(acme|client id|customer id|tenant|company secret|api key|password)\b/i.test(body)) {
    warnings.push("The source may contain tenant-specific or sensitive facts.");
    suggestions.push("Move tenant facts and secrets into scoped knowledge or settings instead of shared skill instructions.");
  }

  return {
    sourceFilename: filename,
    sourceHash: hashString(trimmedMarkdown),
    name,
    description,
    category,
    riskLevel,
    instruction,
    requiredToolMappingsJson: stableStringify(toolHints.required),
    recommendedToolMappingsJson: stableStringify(toolHints.recommended),
    suggestedEvalFixturesJson: stableStringify(suggestedEvalFixtures),
    validation: { errors, warnings, suggestions },
  };
}
