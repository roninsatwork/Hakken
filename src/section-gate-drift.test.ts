import path from "path";
import { describe, expect, test } from "vitest";
import { MENU_FEATURE_KEYS, type MenuFeature } from "@/convex/utils/coreModules";
import { readRepoFile, relativePath, repoRoot, walkRepoFiles } from "@/src/test/driftUtils";

/**
 * A switched-off section is refused on the server, not only hidden
 * (docs/plans/active/features-switches-plan-2026-11-21.md, phase 2). Every
 * client-callable function that only a section's pages show is declared with
 * `moduleQuery`, `moduleMutation` or `moduleAction`, naming that section with
 * `module: MENU_FEATURES.<section>`, so a company with the section off is refused
 * whatever calls it. A function two sections' pages show names both and stays
 * open while either is on.
 *
 * The pages decide, by what they import. A file that calls `api.x.y` is shown on
 * every page that imports it, however many files away: a chart part kept in
 * `/app/analytics/` that Search Console's pages also import is shown in both.
 * Where the file sits says nothing. Sorting by folder got 21 functions wrong on
 * the day this came in. A function any page that stays open shows (the
 * Dashboard, Usage, Ask Hakken) is left open, because refusing it would break
 * that page for a company with the section off. Admin pages don't count either
 * way, since super admins and platform readers pass every switch. Type-only
 * imports show nothing and tests are not pages.
 *
 * A function in a section's own files that no page shows yet is that
 * section's too, so a new read can't be left open until a screen arrives.
 */

const ROUTE_SECTIONS: Record<string, MenuFeature> = {
  sites: "visibility",
  "keyword-research": "visibility",
  "search-console": "searchConsole",
  "bing-webmaster": "bingWebmaster",
  analytics: "googleAnalytics",
  clarity: "clarity",
  "hakken-tasks": "hakkenTasks",
  insights: "insights",
};

/** A section's own files, by name, for the functions no page shows yet. */
const FILE_SECTIONS: [RegExp, MenuFeature][] = [
  [/^googleAnalytics[A-Z]/, "googleAnalytics"],
  [/^searchConsole[A-Z]/, "searchConsole"],
  [/^bingWebmaster[A-Z]/, "bingWebmaster"],
  [/^clarity([A-Z]|$)/, "clarity"],
  [/^(site[A-Z]|keywordResearch)/, "visibility"],
  [/^insights?[A-Z]/, "insights"],
];

const CLIENT_BUILDERS = /^(tenantQuery|tenantMutation|tenantAction|adminQuery|adminMutation|adminAction|moduleQuery|moduleMutation|moduleAction)$/;

const files = [...walkRepoFiles(path.join(repoRoot, "src"), new Set([".ts", ".tsx"])), ...walkRepoFiles(path.join(repoRoot, "convex"), new Set([".ts"]))]
  .map((file) => relativePath(file).replaceAll(path.sep, "/"))
  .filter((file) => !file.startsWith("convex/_generated/"));
const known = new Set(files);
const text = new Map(files.map((file) => [file, readRepoFile(file)]));
const pageFiles = files.filter((file) => file.startsWith("src/") && !/\.test\.tsx?$/.test(file) && !file.startsWith("src/test/"));

function resolveImport(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/") ? specifier.slice(2) : specifier.startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier)) : null;
  if (!base) return null;
  return ["", ".ts", ".tsx", "/index.ts", "/index.tsx"].map((ending) => base + ending).find((candidate) => known.has(candidate)) ?? null;
}

/** Value imports only: `import type` shows nothing on a page. */
const IMPORT = /^(?:import|export)(\s+type)?\s+[\w*{}\s,$]+?\s+from\s*["']([^"']+)["']|^import\s*["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/gm;
const importsOf = new Map(pageFiles.map((file) => [file, [...(text.get(file) ?? "").matchAll(IMPORT)]
  .filter((match) => !match[1])
  .map((match) => resolveImport(file, match[2] ?? match[3] ?? match[4] ?? ""))
  .filter((target): target is string => target !== null && target.startsWith("src/"))]));

/** For every file, the sections whose pages show it and the open pages that do. */
const shownOn = new Map(pageFiles.map((file) => [file, { sections: new Set<MenuFeature>(), open: new Set<string>() }]));
for (const page of pageFiles.filter((file) => /^src\/app\/(.*\/)?(page|layout)\.tsx?$/.test(file) && !file.startsWith("src/app/(dashboard)/admin/"))) {
  const section = ROUTE_SECTIONS[page.match(/^src\/app\/\(dashboard\)\/app\/([^/]+)\//)?.[1] ?? ""];
  const seen = new Set([page]);
  const stack = [page];
  for (let file = stack.pop(); file !== undefined; file = stack.pop()) {
    const where = shownOn.get(file);
    if (section) where?.sections.add(section);
    else where?.open.add(page);
    for (const next of importsOf.get(file) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
}

/** Who calls each `api.<module>.<function>`. */
const callersById = new Map<string, string[]>();
for (const file of pageFiles) {
  for (const match of (text.get(file) ?? "").matchAll(/\bapi\.([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)\.([A-Za-z0-9_]+)\b/g)) {
    const id = `${match[1]}.${match[2]}`;
    callersById.set(id, [...(callersById.get(id) ?? []), file]);
  }
}

type Declaration = { id: string; name: string; file: string; builder: string; declared: MenuFeature[] };

const declarations: Declaration[] = files
  .filter((file) => file.startsWith("convex/") && !/\.test\.ts$/.test(file))
  .flatMap((file) => {
    const moduleName = file.slice("convex/".length).replace(/\.ts$/, "").replaceAll("/", ".");
    return [...(text.get(file) ?? "").matchAll(/^export const (\w+) = (\w+)\(\{\n(?:\s*module: ([^\n]+),\n)?/gm)]
      .filter((match) => CLIENT_BUILDERS.test(match[2] ?? ""))
      .map((match) => ({
        id: `${moduleName}.${match[1]}`,
        name: match[1] ?? "",
        file,
        builder: match[2] ?? "",
        declared: [...(match[3] ?? "").matchAll(/MENU_FEATURES\.(\w+)/g)].map((one) => one[1] as MenuFeature),
      }));
  });

function expectedOf(declaration: Declaration): { sections: MenuFeature[]; open: string[] } {
  const sections = new Set<MenuFeature>();
  const open = new Set<string>();
  for (const caller of callersById.get(declaration.id) ?? []) {
    shownOn.get(caller)?.sections.forEach((section) => sections.add(section));
    shownOn.get(caller)?.open.forEach((page) => open.add(page));
  }
  if (sections.size === 0 && open.size === 0) {
    const own = FILE_SECTIONS.find(([pattern]) => pattern.test(path.basename(declaration.file, ".ts")))?.[1];
    if (own) sections.add(own);
  }
  return { sections: MENU_FEATURE_KEYS.filter((key) => sections.has(key)), open: [...open] };
}

const builderFor = (builder: string) => (builder.startsWith("module") ? builder : builder.replace(/^(tenant|admin)/, "module"));

describe("a switched-off section is refused on the server", () => {
  test("the scan finds the pages and the sections' functions, so it can't pass by reading nothing", () => {
    expect(declarations.length).toBeGreaterThan(500);
    expect(declarations.filter((one) => one.declared.length > 0).length).toBeGreaterThan(250);
    expect([...shownOn.values()].filter((where) => where.sections.has("searchConsole")).length).toBeGreaterThan(50);
  });

  test("every function only a section's pages show names exactly those sections", () => {
    const faults = declarations.flatMap((declaration) => {
      const { sections, open } = expectedOf(declaration);
      if (open.length > 0 || sections.length === 0 || sections.join() === declaration.declared.join()) return [];
      const wanted = sections.map((key) => `MENU_FEATURES.${key}`);
      return [`${declaration.file}: ${declaration.name} is shown only on ${sections.join(" and ")} pages, so declare it with ${builderFor(declaration.builder)} and module: ${wanted.length > 1 ? `[${wanted.join(", ")}]` : wanted[0]}`];
    });
    expect(faults, faults.join("\n")).toEqual([]);
  });

  test("no function a page that stays open shows is switched off with a section", () => {
    const faults = declarations.flatMap((declaration) => {
      const { open } = expectedOf(declaration);
      if (declaration.declared.length === 0 || open.length === 0) return [];
      return [`${declaration.file}: ${declaration.name} names ${declaration.declared.join(", ")} but ${open[0]} shows it, and that page stays open when the section is off`];
    });
    expect(faults, faults.join("\n")).toEqual([]);
  });

  test("the eye checks the section of the screen it was pressed on", () => {
    const eye = readRepoFile("convex/seesAsk.ts");
    expect(eye.match(/requireSectionOn\(ctx, SEES_SECTION_FEATURE\[screen\.section\]\)/g)?.length ?? 0).toBe(2);
  });
});
