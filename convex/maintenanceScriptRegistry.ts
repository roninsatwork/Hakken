export type MaintenanceScriptId =
  | "inventory-rollup-rebuild"
  | "data-migrations-apply"
  ;
export type MaintenanceScriptRisk = "LOW" | "MEDIUM" | "HIGH";
export type MaintenanceScriptCategory =
  | "Inventory"
  | "Analytics"
  | "Workflow"
  | "Retention"
  | "Models"
  | "Agents"
  | "Migrations";

export type MaintenanceScriptDefinition = {
  id: MaintenanceScriptId;
  name: string;
  category: MaintenanceScriptCategory;
  riskLevel: MaintenanceScriptRisk;
  shortDescription: string;
  description: string;
  whenToRun: string;
  changes: string[];
  repeatability: string;
  expectedDuration: string;
};

export const maintenanceScriptDefinitions: MaintenanceScriptDefinition[] = [
  {
    id: "inventory-rollup-rebuild",
    name: "Rebuild inventory rollup",
    category: "Inventory",
    riskLevel: "LOW",
    shortDescription: "Recalculates admin overview inventory and MRR metrics from current records.",
    description:
      "Rebuilds the global inventory rollup used by admin overview metrics. It reads current companies, users, and plans, then replaces the stored rollup values used by dashboard inventory cards.",
    whenToRun:
      "Run this after deploying rollup-backed inventory metrics to an environment with existing data, or when admin overview counts or MRR look stale.",
    changes: [
      "Updates total provisioned user count.",
      "Updates total provisioned company count.",
      "Updates plan inventory counts.",
      "Updates monthly recurring revenue based on active plan assignments.",
    ],
    repeatability: "Safe to run more than once. It recalculates from current records each time.",
    expectedDuration: "Usually completes in a few seconds for current data volumes.",
  },
  {
    id: "data-migrations-apply",
    name: "Apply pending data migrations",
    category: "Migrations",
    riskLevel: "MEDIUM",
    shortDescription:
      "Backfills existing records after a schema change. Starts any registered migration that has not completed.",
    description:
      "Deploying a schema change adds new fields but never fills them in on records that already exist. This script starts every registered data migration that has not yet completed, so older records are brought up to date. Each migration processes records in pages and records its own progress, so a large table is handled safely rather than in one long operation.",
    whenToRun:
      "Run after deploying a release that adds a field to existing data. Also run it to check migration state: it reports the status of every registered migration whether or not anything needed starting.",
    changes: [
      "Starts each registered data migration that is not already complete.",
      "Backfills fields on existing records that predate a schema change.",
      "Records progress and completion for each migration.",
    ],
    repeatability:
      "Safe to run more than once. Migrations skip records that are already up to date, and a completed migration is not started again.",
    expectedDuration:
      "Returns immediately. Migrations continue in the background; re-run this script to see updated progress.",
  },
];

export function getMaintenanceScriptDefinition(scriptId: string) {
  return maintenanceScriptDefinitions.find((script) => script.id === scriptId) ?? null;
}
