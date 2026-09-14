import fs from "node:fs";
import { createHash } from "node:crypto";
import { recipes } from "./catalog.mjs";
import { parseArgs } from "../entity-generator/model.mjs";
import { planEntity, readFile } from "../entity-generator/plan.mjs";
import { validateProduct } from "../product-config.mjs";

const REGISTRY = "product.recipes.json";
const section = (title, items) =>
  `## ${title}\n\n${items.map((item) => `- ${item}`).join("\n")}\n\n`;

export function planRecipe(root, id) {
  root = fs.realpathSync(root);
  const recipe = recipes.find((entry) => entry.id === id);
  if (!recipe) throw new Error(`Unknown recipe: ${id}. Use --list.`);
  validateProduct(JSON.parse(readFile(root, "sonae.product.json")));
  const before = readFile(root, REGISTRY, true);
  const registry =
    before === null ? { version: 1, recipes: [] } : JSON.parse(before);
  if (
    registry.version !== 1 ||
    !Array.isArray(registry.recipes) ||
    registry.recipes.some(
      (entry) =>
        !entry ||
        typeof entry.id !== "string" ||
        !Number.isInteger(entry.version) ||
        !/^[a-f0-9]{64}$/.test(entry.definitionHash),
    )
  )
    throw new Error(
      "Invalid product recipe registry; review it before continuing.",
    );
  if (registry.recipes.some((entry) => entry.id === id))
    throw new Error(
      `Recipe already installed: ${id}. Review product changes manually; recipes do not upgrade existing features.`,
    );
  const guidePath = `docs/product/${id}.md`;
  if (readFile(root, guidePath, true) !== null)
    throw new Error(`Refusing to overwrite ${guidePath}`);
  const overlay = new Map();
  const edits = new Map();
  const entities = recipe.entities.map((args) => parseArgs(args).entity);
  for (const entity of entities) {
    for (const edit of planEntity(root, entity, overlay).edits) {
      const original = edits.get(edit.path);
      edits.set(edit.path, {
        ...edit,
        before: original ? original.before : edit.before,
      });
      overlay.set(edit.path, edit.after);
    }
  }
  const guide =
    `# ${recipe.title}\n\n${recipe.purpose}\n\nRecipe: \`${id}\`, version ${recipe.version}. Applied locally; live setup and launch checks remain to be done.\n\n` +
    section(
      "Generated surfaces",
      entities.length
        ? entities.map(
            (e) =>
              `\`/admin/${e.route}\`: list/search, create/edit, details and linked records. Table: \`${e.table}\`.`,
          )
        : [
            "Uses existing company knowledge, agent administration and /app/assistant; no new runtime surfaces.",
          ],
    ) +
    section("Setup", recipe.setup) +
    section("First workflow", recipe.workflow) +
    section("Launch checks", recipe.launch) +
    section("Product decisions still needed", recipe.gaps) +
    "## Local verification\n\nReview the diff, then use Node from `.nvmrc` and run `npm ci`, `npm run verify:env`, `npm run check`, `npm run lint:all` and `npm run build`. Generated backend and form tests use local mocks. Complete the launch checks against your own test deployment before releasing.\n\n" +
    "See [Product Setup](../operator/product-setup.md), [Feature Generator](../developer/feature-generator.md), [Starter Checklist](../developer/new-agentic-app-setup-checklist.md) and [Framework Updates](../operator/framework-updates.md).\n";
  edits.set(guidePath, { path: guidePath, before: null, after: guide });
  const record = {
    id,
    version: recipe.version,
    definitionHash: createHash("sha256")
      .update(JSON.stringify(recipe))
      .digest("hex"),
  };
  edits.set(REGISTRY, {
    path: REGISTRY,
    before,
    after:
      JSON.stringify(
        { ...registry, recipes: [...registry.recipes, record] },
        null,
        2,
      ) + "\n",
  });
  return { root, recipe, edits: [...edits.values()] };
}
