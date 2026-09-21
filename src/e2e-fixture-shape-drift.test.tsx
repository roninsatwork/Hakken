/**
 * The browser tests do not talk to a real backend. They talk to a stand-in in
 * `src/e2e/convexReactMock.tsx` whose answers were typed out by hand.
 *
 * Nothing ever compared those answers to what the real functions return, so
 * they drifted, in both directions and silently:
 *
 *   - A field the real answer always sends, missing from the stand-in, means a
 *     screen reads `undefined`. That is how the admin dashboard came to crash
 *     in CI on 2026-08-27 while every unit test stayed green.
 *   - A field the stand-in sends that the real answer never does is worse. A
 *     screen can be built on it, pass every browser test, and then show nothing
 *     to a real person — Convex refuses an undeclared field at run time rather
 *     than passing it through, so the field simply is not there in production.
 *
 * Comparing the two only became possible once every client-callable function
 * declared a return shape (work package E5). The real declaration is read from
 * the function itself through `exportReturns()`, so this compares the stand-in
 * against the source of truth rather than against a second hand-written copy.
 *
 * This guard only ever tightens. If it fails, fix the stand-in — do not relax
 * the comparison.
 */

import { expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { renderHook } from "@testing-library/react";
import { makeFunctionReference } from "convex/server";
import {
  conformanceProblems,
  summariseProblems,
  type ExportedValidator,
} from "./test/validatorConformance";
import { useQuery, usePaginatedQuery } from "./e2e/convexReactMock";

const repoRoot = path.resolve(__dirname, "..");
const mockPath = "src/e2e/convexReactMock.tsx";
const mockSource = fs.readFileSync(path.join(repoRoot, mockPath), "utf8");
const mockLines = mockSource.split("\n");

// Lazy on purpose: an eager glob would also import every convex test file.
const convexModules = import.meta.glob("../convex/*.ts") as Record<
  string,
  () => Promise<Record<string, unknown>>
>;

/**
 * The stand-in answers a question if it names its path. Reading the paths out
 * of the source rather than listing them here means a fixture added tomorrow is
 * checked tomorrow, with nobody having to remember this file exists.
 */
function pathsBetween(fromLine: number, toLine: number) {
  const found = new Set<string>();
  for (const line of mockLines.slice(fromLine - 1, toLine)) {
    for (const match of line.matchAll(/path === "([^"]+)"/g)) found.add(match[1]);
  }
  return Array.from(found).sort();
}

const lineOf = (needle: string) => {
  const index = mockLines.findIndex((line) => line.includes(needle));
  if (index === -1) throw new Error(`${mockPath} no longer contains ${needle}`);
  return index + 1;
};

/**
 * Both frozen, both one-way. `COMPARED_FLOOR` may only rise and `HOLLOW_CEILING`
 * may only fall — raising the ceiling to make a change pass is the move these
 * numbers exist to prevent.
 */
const COMPARED_FLOOR = 49
// template:remove:start movement
+ 4
// template:remove:end
;
const HOLLOW_CEILING = 7
// template:remove:start movement
+ 3
// template:remove:end
;

const queryPaths = pathsBetween(lineOf("export function useQuery("), lineOf("export function useMutation("));
const pagedPaths = pathsBetween(lineOf("export function usePaginatedQuery("), mockLines.length);

async function declaredShapeOf(fullPath: string): Promise<ExportedValidator | null> {
  const [moduleName, exportName] = fullPath.split(":");
  const loader = convexModules[`../convex/${moduleName}.ts`];
  if (!loader) return null;
  const loaded = await loader();
  const fn = loaded[exportName] as { exportReturns?: () => string } | undefined;
  if (!fn || typeof fn.exportReturns !== "function") return null;
  return JSON.parse(fn.exportReturns()) as ExportedValidator;
}

function fixtureValue(fullPath: string, paged: boolean) {
  const reference = makeFunctionReference<"query">(fullPath);
  const { result } = renderHook(() =>
    paged ? usePaginatedQuery(reference, {}) : useQuery(reference, {})
  );
  return paged ? (result.current as { results?: unknown }).results : result.current;
}

/**
 * The paged hook hands a screen the rows; the declaration describes the whole
 * page envelope. Compare rows against rows.
 */
function rowsShapeOf(validator: ExportedValidator) {
  const fields = validator.value as
    | Record<string, { fieldType: ExportedValidator }>
    | undefined;
  return fields?.page?.fieldType ?? null;
}

test("every stand-in answer matches what the real function declares", async () => {
  document.cookie = "hakken_e2e_auth=super-admin";

  const undeclared: string[] = [];
  const notPaged: string[] = [];
  const drifted: string[] = [];
  const hollow: string[] = [];
  let compared = 0;

  const inspect = async (fullPath: string, paged: boolean) => {
    const declared = await declaredShapeOf(fullPath);
    if (!declared) {
      undeclared.push(fullPath);
      return;
    }

    const target = paged ? rowsShapeOf(declared) : declared;
    if (!target) {
      notPaged.push(fullPath);
      return;
    }

    // Company billing is deliberately absent for platform operators. Compare
    // its populated answer using the company role that actually opens it.
    if (fullPath === "billing:getStatus") document.cookie = "hakken_e2e_auth=company-admin";
    const value = fixtureValue(fullPath, paged);
    document.cookie = "hakken_e2e_auth=super-admin";
    // `undefined` is how the stand-in spells "still loading", which no
    // declaration describes and nothing can be concluded from.
    if (value === undefined) return;

    // Asked with no arguments, some fixtures answer nothing — they branch on an
    // id or a filter first. Nothing is a valid answer, so this cannot fail, but
    // it means the interesting half of that fixture is not being compared. The
    // count is frozen so the unseen half cannot quietly grow.
    if (value === null || (Array.isArray(value) && value.length === 0)) {
      hollow.push(fullPath);
      return;
    }

    compared += 1;
    const problems = conformanceProblems(value, target);
    if (problems.length > 0) {
      drifted.push(`${fullPath}\n${summariseProblems(problems).replace(/^/gm, "    ")}`);
    }
  };

  for (const fullPath of queryPaths) await inspect(fullPath, false);
  for (const fullPath of pagedPaths) await inspect(fullPath, true);

  expect(
    undeclared,
    `The stand-in answers questions the backend does not ask. Either the function was renamed and the fixture kept the old name, or it was deleted and the fixture outlived it — a fixture nobody can reach is a screen nobody is testing:\n${undeclared.join("\n")}`
  ).toEqual([]);

  expect(
    notPaged,
    `These are answered through the paged hook but the real function does not return a page:\n${notPaged.join("\n")}`
  ).toEqual([]);

  expect(
    drifted,
    `The stand-in no longer matches what the real function declares. Fix the stand-in — a screen built against a wrong stand-in passes here and fails in front of a person:\n\n${drifted.join("\n\n")}`
  ).toEqual([]);

  // A guard that quietly compared nothing would pass here forever. These two
  // counts are what stops that: how many answers were really looked at, and how
  // many answered nothing and so were not. Both only ever move the right way.
  expect(
    compared,
    "Fewer stand-in answers were compared than before. A fixture has stopped answering, so it is no longer being checked."
  ).toBeGreaterThanOrEqual(COMPARED_FLOOR);

  expect(
    hollow.length,
    `More stand-ins answer nothing when asked with no arguments than before, so less is being checked than was. Give the fixture the arguments its screen uses, or make it answer:\n${hollow.join("\n")}`
  ).toBeLessThanOrEqual(HOLLOW_CEILING);
});

test("the comparison can actually tell a wrong answer from a right one", () => {
  const declaration: ExportedValidator = {
    type: "object",
    value: {
      name: { fieldType: { type: "string" }, optional: false },
      count: { fieldType: { type: "number" }, optional: false },
      note: { fieldType: { type: "string" }, optional: true },
    },
  };

  // Everything the declaration asks for, nothing it does not.
  expect(conformanceProblems({ name: "a", count: 1 }, declaration)).toEqual([]);
  expect(conformanceProblems({ name: "a", count: 1, note: "n" }, declaration)).toEqual([]);

  // The three ways a hand-written copy goes wrong, each of which has actually
  // happened in this repository.
  expect(conformanceProblems({ name: "a" }, declaration)).toEqual([
    "(root).count: missing — the real answer always has it",
  ]);
  expect(conformanceProblems({ name: "a", count: 1, extra: true }, declaration)).toEqual([
    "(root).extra: invented — the real answer never sends it",
  ]);
  expect(conformanceProblems({ name: "a", count: "1" }, declaration)).toEqual([
    "(root).count: expected a number, got the text \"1\"",
  ]);
});
