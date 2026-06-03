export type MaintenanceScriptId = "inventory-rollup-rebuild";
export type MaintenanceScriptRisk = "LOW" | "MEDIUM" | "HIGH";
export type MaintenanceScriptCategory = "Inventory" | "Analytics" | "Workflow" | "Retention" | "Models";

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
];

export function getMaintenanceScriptDefinition(scriptId: string) {
  return maintenanceScriptDefinitions.find((script) => script.id === scriptId) ?? null;
}
