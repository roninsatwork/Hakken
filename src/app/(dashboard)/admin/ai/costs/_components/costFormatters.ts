export function formatGbpAmount(value: number, digits = 4) {
  return `£${value.toLocaleString("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatSmallGbpAmount(value: number | undefined, digits = 5) {
  const safeValue = value ?? 0;
  if (safeValue < 0.00001 && safeValue > 0) return "£< 0.00001";

  return `£${safeValue.toLocaleString("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatCostAxisTick(value: number | string) {
  return formatGbpAmount(Number(value || 0), 4);
}

export function formatTokenAxisTick(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(0)}k` : String(value);
}

export function getAgentMessageCount(interactions?: number, messages?: number) {
  return interactions || messages || 0;
}
