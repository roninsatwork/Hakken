export type AiContentPart =
  | { type: "text"; text: string }
  | { type: "inlineData"; mimeType: string; data: string };

export type ResolvedAiModelConfig = {
  modelId: string;
  providerKey: string;
  providerModelId: string;
};

export type AiGenerationRequest = {
  model: ResolvedAiModelConfig;
  systemInstruction?: string;
  contents: AiContentPart[];
  temperature?: number;
  maxOutputTokens?: number;
  thinkingLevel?: string;
};

export type AiGenerationResponse = {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
};

export interface AiProviderAdapter {
  providerKey: string;
  generateText(args: AiGenerationRequest): Promise<AiGenerationResponse>;
}
