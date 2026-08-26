import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * One front door for the movement demo's command set.
 *
 * There are 101 of them and they are prefixed `movement:`, which is what
 * buries the thirty commands the rest of the platform actually uses. The
 * obvious fix is to rename them into a dispatcher and delete the prefixed
 * entries, and that fix is not available: the names are referenced 1,258
 * times across 96 files, and four of those references are inside the frozen
 * Posture Studio source. `MovementCaptureClient` puts one on screen for the
 * user to copy and type. Renaming would print an instruction that no longer
 * works.
 *
 * So this dispatches rather than replaces. Every `npm run movement:<name>`
 * keeps working exactly as it did, and `npm run movement` becomes a readable
 * index of what there is, grouped, instead of a wall inside `npm run`.
 */

const PREFIX = "movement:";

const packageJson = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
);

const commands = Object.keys(packageJson.scripts ?? {})
  .filter((name) => name.startsWith(PREFIX))
  .sort();

/** The segment after `movement:` is what the demo groups its work by. */
const groupOf = (name) => name.slice(PREFIX.length).split(":")[0];

function list() {
  const groups = new Map();
  for (const name of commands) {
    const group = groupOf(name);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(name.slice(PREFIX.length));
  }

  /**
   * Grouping on the first segment alone produced forty headings, twenty-one of
   * them holding a single command, which is the same wall with more blank
   * lines in it. The families that earn a heading are the ones with more than
   * one command in them; the rest read better as a single closing list.
   */
  const families = [...groups].filter(([, names]) => names.length > 1)
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]));
  const oneOffs = [...groups].filter(([, names]) => names.length === 1)
    .map(([, names]) => names[0]).sort();

  console.log(`\n  ${commands.length} movement demo commands: ${families.length} families and ${oneOffs.length} one-offs.`);
  console.log(`  Run one with:  npm run movement -- <name>`);
  console.log(`  Full names still work:  npm run movement:<name>\n`);

  for (const [group, names] of families) {
    console.log(`  ${group}  (${names.length})`);
    for (const name of names.sort()) console.log(`    ${name}`);
    console.log("");
  }

  console.log(`  one-offs  (${oneOffs.length})`);
  for (const name of oneOffs) console.log(`    ${name}`);
  console.log("");
}

function run(requested, forwarded) {
  const name = requested.startsWith(PREFIX) ? requested : `${PREFIX}${requested}`;

  if (!commands.includes(name)) {
    const family = name.slice(PREFIX.length).split(":")[0];
    /**
     * Matching on `includes` alone answered a wrong `replay:` name with the
     * whole of `replay-game`, because that family sorts first and contains the
     * string. A command's own family is the better answer when it has one.
     */
    const sameFamily = commands.filter((candidate) => groupOf(candidate) === family);
    const near = (sameFamily.length > 0
      ? sameFamily
      : commands.filter((candidate) => candidate.includes(family))
    ).slice(0, 8);

    console.error(`\n  There is no "${name}".\n`);
    if (near.length > 0) {
      console.error("  Closest:");
      for (const candidate of near) console.error(`    ${candidate.slice(PREFIX.length)}`);
      console.error("");
    }
    console.error("  Run `npm run movement` for the full list.\n");
    process.exit(1);
  }

  const result = spawnSync("npm", ["run", name, ...(forwarded.length > 0 ? ["--", ...forwarded] : [])], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  process.exit(result.status ?? 1);
}

const [requested, ...forwarded] = process.argv.slice(2);
if (requested === undefined) list();
else run(requested, forwarded);
