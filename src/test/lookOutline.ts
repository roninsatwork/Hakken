import path from "node:path";
import { expect } from "vitest";

/**
 * A screen's look, read from what it rendered (docs/plans/active/design-drift-plan.md, D4).
 *
 * The screen kit marks each of its parts with `data-part` — a header, a row of
 * figures, a chart card, a notice, a search box, a filter, a table — and the
 * part's title with `data-part-title` (or `data-part-label`). This reads them
 * top to bottom, nested as they nest, each with its title, and each table with
 * its headings. Rows, numbers and words that come from data are left out, so
 * the outline changes only when the look does: a part added, removed or
 * moved, a title reworded, a column added, dropped or renamed.
 */
export function lookOutline(root: Element): string {
  const lines: string[] = [];
  const walk = (element: Element, depth: number) => {
    for (const child of Array.from(element.children)) {
      // A table's rows are data: what a row holds is the rows', not the screen's.
      if (child.tagName === "TBODY") continue;
      const part = child.getAttribute("data-part");
      if (part) {
        lines.push(`${"  ".repeat(depth)}${describe(child, part)}`);
        walk(child, depth + 1);
      } else {
        walk(child, depth);
      }
    }
  };
  walk(root, 0);
  return lines.join("\n");
}

const words = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
/** A number in a title is a count of something held — data — so every one reads "#". */
const masked = (text: string | null | undefined) => words(text).replace(/\d[\d,.]*/g, "#");

function describe(element: Element, part: string): string {
  const variant = element.getAttribute("data-part-variant");
  const name = variant ? `${part} (${variant})` : part;
  const title = titleOf(element, part);
  return title ? `${name}: ${title}` : name;
}

/** The part's own title: not one belonging to a part inside it. */
function ownTitle(element: Element): string {
  for (const candidate of Array.from(element.querySelectorAll("[data-part-title]"))) {
    if (candidate.closest("[data-part]") === element) return masked(candidate.textContent);
  }
  return "";
}

/** A record's page is titled with the record — a keyword, a page, a run — which is data. */
function isRecordTitle(element: Element, part: string): boolean {
  const heading = Array.from(element.querySelectorAll("h1")).find((h1) => h1.closest("[data-part]") === element);
  if (!heading) return false;
  return part === "detail-header" || element.parentElement?.closest("[data-part]")?.getAttribute("data-part") === "detail-header";
}

/**
 * A table's column headings: the last heading row (a row above it groups the
 * columns under names that are data, as Content gap's competitors), with a
 * run of columns repeated per item written once, as Content gap's Position |
 * Traffic for each competitor.
 */
function headingsOf(element: Element): string {
  const rows = element.querySelectorAll("thead tr");
  const last = rows[rows.length - 1];
  if (!last) return "";
  const headings = Array.from(last.querySelectorAll("th")).map((cell) => masked(cell.textContent) || "·");
  const folded: string[] = [];
  for (let at = 0; at < headings.length;) {
    let step = 1;
    for (let size = 1; size <= 3; size += 1) {
      const block = headings.slice(at, at + size);
      if (block.length < size) break;
      let times = 1;
      while (headings.slice(at + times * size, at + (times + 1) * size).join("\u0000") === block.join("\u0000")) times += 1;
      if (times > 1) {
        folded.push(`(${block.join(" | ")}) for each`);
        step = times * size;
        break;
      }
    }
    if (step === 1) folded.push(headings[at]);
    at += step;
  }
  return folded.join(" | ");
}

/** A select named by a label of its own rather than an aria-label. */
function selectLabel(element: Element): string {
  const select = element.querySelector("select");
  const label = select?.id ? element.ownerDocument.querySelector(`label[for="${select.id}"]`) : null;
  return masked(label?.textContent ?? select?.getAttribute("aria-label"));
}

function titleOf(element: Element, part: string): string {
  if (isRecordTitle(element, part)) return "‹the record's name›";
  const label = element.getAttribute("data-part-label");
  if (part === "choice") {
    const options = Array.from(element.querySelectorAll("button")).map((option) => masked(option.textContent)).join(" | ");
    return `${masked(label)}: ${options}`;
  }
  if (label) return masked(label);
  if (part === "search") return masked(element.querySelector("input")?.getAttribute("placeholder"));
  if (part === "table" || part === "compact-list") return headingsOf(element);
  if (part === "select" || part === "filter") return selectLabel(element);
  if (part === "tabs") return Array.from(element.querySelectorAll("a, button")).map((tab) => masked(tab.textContent)).filter(Boolean).join(" | ");
  if (part === "primary-action" || part === "show-more") return masked(element.textContent);
  return ownTitle(element);
}

/**
 * Holds a screen to its approved look: the outline must equal the one saved
 * beside the plan's approved drawing, `docs/plans/assets/<plan>/look/<board>.txt`.
 *
 * A change here is a change to a look Anthony approved. It is drawn and
 * approved again first; then the drawing, this file and the screen change in
 * the same commit (`npx vitest run <this test> -u` writes the new outline).
 */
export async function expectApprovedLook(root: Element, plan: string, board: string, screen: string) {
  const file = path.join(process.cwd(), "docs/plans/assets", plan, "look", `${board}.txt`);
  const header = [
    `# ${screen} — the approved look (board "${board}" of docs/plans/assets/${plan}/).`,
    "# Its kit parts top to bottom, each with its title, and each table's headings.",
    "# Change it only after Anthony approves a redrawn look: design-drift-plan D4.",
    "",
  ].join("\n");
  await expect(`${header}${lookOutline(root)}\n`).toMatchFileSnapshot(file);
}
