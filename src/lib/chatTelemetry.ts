type ChatTelemetryMessage = {
  inputTokens?: number;
  outputTokens?: number;
  modelUsed?: string;
};

const GBP_PER_USD = 0.78;
const PRO_INPUT_USD_PER_MILLION = 3.5;
const PRO_OUTPUT_USD_PER_MILLION = 10.5;
const STANDARD_INPUT_USD_PER_MILLION = 0.075;
const STANDARD_OUTPUT_USD_PER_MILLION = 0.3;

function getTokenCount(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isProModel(modelUsed: string | undefined) {
  return modelUsed?.toLowerCase().includes("pro") ?? false;
}

export function getMessageTokenTotal(message: ChatTelemetryMessage) {
  return getTokenCount(message.inputTokens) + getTokenCount(message.outputTokens);
}

export function getChatTokenTotal(messages: ChatTelemetryMessage[]) {
  return messages.reduce((total, message) => total + getMessageTokenTotal(message), 0);
}

export function estimateMessageCostGbp(message: ChatTelemetryMessage) {
  const inputTokens = getTokenCount(message.inputTokens);
  const outputTokens = getTokenCount(message.outputTokens);
  const inputRate = isProModel(message.modelUsed) ? PRO_INPUT_USD_PER_MILLION : STANDARD_INPUT_USD_PER_MILLION;
  const outputRate = isProModel(message.modelUsed) ? PRO_OUTPUT_USD_PER_MILLION : STANDARD_OUTPUT_USD_PER_MILLION;
  const costUsd = (inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate;

  return costUsd * GBP_PER_USD;
}

export function estimateChatCostGbp(messages: ChatTelemetryMessage[]) {
  return messages.reduce((total, message) => total + estimateMessageCostGbp(message), 0);
}

export function formatEstimatedChatCostGbp(messages: ChatTelemetryMessage[]) {
  return estimateChatCostGbp(messages).toFixed(5);
}
