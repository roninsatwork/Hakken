#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import {
  compareFramework,
  writeReview,
  recordReview,
} from "./framework-updates/review.mjs";

export function main(args = process.argv.slice(2)) {
  const values = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (
      !["--root", "--upstream", "--write-plan", "--record-review"].includes(
        flag,
      ) ||
      flag in values ||
      !args[i + 1] ||
      args[i + 1].startsWith("--")
    )
      throw new Error(`Unknown, duplicate or incomplete argument: ${flag}`);
    values[flag] = args[++i];
  }
  if (
    !values["--upstream"] ||
    (values["--write-plan"] && values["--record-review"])
  )
    throw new Error(
      "Usage: npm run framework:update -- --upstream <fresh-export> [--write-plan <new-review.json> | --record-review <review.json>] [--root <product>]",
    );
  const root = values["--root"] ?? process.cwd();
  const upstream = values["--upstream"];
  if (values["--record-review"]) {
    const history = recordReview(root, upstream, values["--record-review"]);
    console.log(
      `Recorded reviewed baseline and ${history}. Review and commit these metadata files locally. No product code, dependencies, remotes or deployments were changed.`,
    );
    return;
  }
  const plan = compareFramework(root, upstream);
  console.log(
    `Incoming source: ${plan.source.commit ?? "unversioned"}; ${plan.source.dirty === false ? "clean source" : "working-tree snapshot (not a release claim)"}.`,
  );
  console.log(
    `Modules: ${plan.keep.join(", ")}. ${plan.entries.length} incoming file changes; ${plan.productOnly.length} additional product changes.`,
  );
  for (const entry of plan.entries.slice(0, 40))
    console.log(`  ${entry.change}: ${entry.path}`);
  if (plan.entries.length > 40)
    console.log(
      "  More changes omitted here; --write-plan includes every file.",
    );
  if (values["--write-plan"])
    console.log(`Review written: ${writeReview(plan, values["--write-plan"])}`);
  else
    console.log(
      "Read-only comparison. Use --write-plan <new-file-outside-product.json> to prepare a review.",
    );
  console.log(
    "Review/integrate changes explicitly and run the product checks. See docs/operator/framework-updates.md. This tool never merges or copies incoming product code.",
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
