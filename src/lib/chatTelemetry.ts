type ChatTelemetryMessage = {
  inputTokens?: number;
  outputTokens?: number;
  modelUsed?: string;
};

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

/**
 * Dollars, because the rates above are the providers' own published dollar
 * prices. This used to multiply by a fixed 0.78 and call the result pounds — a
 * guessed exchange rate that went stale the day it was written, in front of a
 * number nobody had converted anywhere else in the product.
 */
export function estimateMessageCostUsd(message: ChatTelemetryMessage) {
  const inputTokens = getTokenCount(message.inputTokens);
  const outputTokens = getTokenCount(message.outputTokens);
  const inputRate = isProModel(message.modelUsed) ? PRO_INPUT_USD_PER_MILLION : STANDARD_INPUT_USD_PER_MILLION;
  const outputRate = isProModel(message.modelUsed) ? PRO_OUTPUT_USD_PER_MILLION : STANDARD_OUTPUT_USD_PER_MILLION;

  return (inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate;
}

export function estimateChatCostUsd(messages: ChatTelemetryMessage[]) {
  return messages.reduce((total, message) => total + estimateMessageCostUsd(message), 0);
}

export function formatEstimatedChatCostUsd(messages: ChatTelemetryMessage[]) {
  return estimateChatCostUsd(messages).toFixed(5);
}
