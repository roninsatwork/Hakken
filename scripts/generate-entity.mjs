#!/usr/bin/env node
/** Complete tenant-scoped admin feature. Preview by default; --apply writes local files only. */
import { pathToFileURL } from "node:url";
import { parseArgs } from "./entity-generator/model.mjs";
import { planEntity, applyEntity } from "./entity-generator/plan.mjs";

export function main(argv = process.argv.slice(2)) {
  const { entity, root, apply } = parseArgs(argv);
  const plan = planEntity(root, entity);
  console.log(
    `Feature: ${entity.table}\nRoute: /admin/${entity.route}\nSearch/label field: ${entity.labelField}`,
  );
  console.log(
    "Access: ADMIN/SUPER_ADMIN write; READ_ONLY read; active company only.",
  );
  for (const edit of plan.edits)
    console.log(`  ${edit.before === null ? "create" : "update"} ${edit.path}`);
  if (apply) {
    applyEntity(plan);
    console.log(
      "Applied locally. Review the diff, then run npm run check and npm run build. Deploy separately when ready.",
    );
  } else
    console.log(
      "Preview only. Repeat with --apply to write these files. No deployment or remote calls.",
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
