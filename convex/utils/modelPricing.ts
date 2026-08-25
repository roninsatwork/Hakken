/**
 * Whether spend can actually be measured for a model.
 *
 * Cost calculation multiplies token counts by the rates on the model record.
 * When those rates are absent it returns 0, so a cost budget can never trigger.
 * Keep this pure helper separate from the runtime service so client screens can
 * use the same rule without loading the rest of the agent runtime.
 */
export function isModelCostMeasurable(
  model: { standardInputCostBelow200k?: number; outputResponseCost?: number } | null | undefined,
) {
  const input = model?.standardInputCostBelow200k ?? 0;
  const output = model?.outputResponseCost ?? 0;
  return input > 0 || output > 0;
}
