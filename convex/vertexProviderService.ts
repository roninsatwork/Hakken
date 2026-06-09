import { GoogleGenAI } from "@google/genai";
import type {
  EmbedContentParameters,
  EmbedContentResponse,
  GenerateContentParameters,
  GenerateContentResponse,
} from "@google/genai";
import { GOOGLE_VERTEX_PROVIDER_KEY } from "./aiModelService";
import { withProviderRetry, type ProviderRetryPolicy } from "./aiProviderRetryService";

export type VertexProviderEnv = {
  GOOGLE_CLOUD_PROJECT?: string;
  GOOGLE_CLOUD_LOCATION?: string;
  GOOGLE_CLIENT_EMAIL?: string;
  GOOGLE_PRIVATE_KEY?: string;
};

export type VertexProviderConfig = {
  project: string;
  location: string;
  credentials: {
    client_email: string;
    private_key: string;
  };
};

export const DEFAULT_VERTEX_PROJECT = "sonae-dev-491717";
export const DEFAULT_VERTEX_LOCATION = "global";

export function buildVertexProviderConfig(args: {
  env: VertexProviderEnv;
  location?: string;
}): VertexProviderConfig {
  const clientEmail = args.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = args.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error("Vertex AI credentials are missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY.");
  }

  return {
    project: args.env.GOOGLE_CLOUD_PROJECT || DEFAULT_VERTEX_PROJECT,
    location: args.location || args.env.GOOGLE_CLOUD_LOCATION || DEFAULT_VERTEX_LOCATION,
    credentials: {
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, "\n"),
    },
  };
}

export function createVertexGenAIClient(args: { env?: VertexProviderEnv; location?: string } = {}) {
  const env = args.env ?? {
    GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
    GOOGLE_CLOUD_LOCATION: process.env.GOOGLE_CLOUD_LOCATION,
    GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL,
    GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,
  };

  const config = buildVertexProviderConfig({
    env,
    location: args.location,
  });

  return new GoogleGenAI({
    project: config.project,
    location: config.location,
    vertexai: true,
    googleAuthOptions: {
      credentials: config.credentials,
    },
  });
}

function logGoogleRetry(event: {
  operation: string;
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  status?: number;
  code?: string;
}) {
  console.warn("Provider retry", {
    providerKey: GOOGLE_VERTEX_PROVIDER_KEY,
    providerName: "Google Vertex AI",
    operation: event.operation,
    attempt: event.attempt,
    maxAttempts: event.maxAttempts,
    delayMs: event.delayMs,
    status: event.status,
    code: event.code,
  });
}

export async function generateVertexContentWithRetry(
  ai: GoogleGenAI,
  params: GenerateContentParameters,
  args: {
    operation?: string;
    retryPolicy?: Partial<ProviderRetryPolicy>;
  } = {}
): Promise<GenerateContentResponse> {
  const operation = args.operation ?? "generateContent";
  return await withProviderRetry({
    providerKey: GOOGLE_VERTEX_PROVIDER_KEY,
    providerName: "Google Vertex AI",
    operation,
    policy: args.retryPolicy,
    onRetry: (event) => logGoogleRetry(event),
  }, async () => await ai.models.generateContent(params));
}

export async function embedVertexContentWithRetry(
  ai: GoogleGenAI,
  params: EmbedContentParameters,
  args: {
    operation?: string;
    retryPolicy?: Partial<ProviderRetryPolicy>;
  } = {}
): Promise<EmbedContentResponse> {
  const operation = args.operation ?? "embedContent";
  return await withProviderRetry({
    providerKey: GOOGLE_VERTEX_PROVIDER_KEY,
    providerName: "Google Vertex AI",
    operation,
    policy: args.retryPolicy,
    onRetry: (event) => logGoogleRetry(event),
  }, async () => await ai.models.embedContent(params));
}
