#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { recipes } from "./product-recipes/catalog.mjs";
import { planRecipe } from "./product-recipes/plan.mjs";
import { applyEntity } from "./entity-generator/plan.mjs";

export function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === "--list") {
    for (const recipe of recipes)
      console.log(`${recipe.id}: ${recipe.purpose}`);
    return;
  }
  const [id, ...flags] = args;
  let root = process.cwd();
  let apply = false;
  let preview = false;
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] === "--apply") apply = true;
    else if (flags[i] === "--dry-run") preview = true;
    else if (
      flags[i] === "--root" &&
      flags[i + 1] &&
      !flags[i + 1].startsWith("--")
    )
      root = flags[++i];
    else throw new Error(`Unknown or incomplete argument: ${flags[i]}`);
  }
  if (apply && preview)
    throw new Error("Choose --apply or --dry-run, not both.");
  const plan = planRecipe(root, id);
  console.log(`${plan.recipe.title}: ${plan.recipe.purpose}`);
  for (const edit of plan.edits)
    console.log(`  ${edit.before === null ? "create" : "update"} ${edit.path}`);
  if (apply) {
    applyEntity(plan);
    console.log(
      `Applied locally. Follow docs/product/${id}.md for setup, product decisions and launch checks.`,
    );
  } else
    console.log(
      "Preview only. Add --apply to write the complete recipe locally. No live setup or deployment.",
    );
  return plan;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
