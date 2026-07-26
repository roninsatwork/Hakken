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
  /**
   * Ask for a JSON answer matching this schema.
   *
   * Several parts of this platform — intent routing, report generation,
   * workflow-node configuration — need structured output, and each of them was
   * written directly against Vertex's `responseSchema`. That is why they could
   * not run on any other provider: not because the model could not do it, but
   * because the request had no neutral way to say so.
   *
   * Plain JSON Schema, because every provider accepts some form of it and
   * Vertex's own `Schema` type is the odd one out. Each adapter translates.
   */
  jsonSchema?: Record<string, unknown>;
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
