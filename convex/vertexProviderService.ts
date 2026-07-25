import { GoogleGenAI } from "@google/genai";
import type {
  Content,
  EmbedContentParameters,
  EmbedContentResponse,
  GenerateContentParameters,
  GenerateContentResponse,
  Tool,
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

/**
 * Streaming counterpart to `generateVertexContentWithRetry`.
 *
 * Calls `onText` for each text fragment as it arrives, then returns a response
 * shaped like the non-streaming one — accumulated text, the function calls the
 * model asked for, and usage — so the caller's loop is unchanged apart from
 * seeing the text earlier.
 *
 * Retries only apply before the first fragment is delivered. Once the caller has
 * shown text to a reader, a retry would replay the answer from the beginning and
 * duplicate what they already saw; failing is the honest outcome instead.
 */
export async function streamVertexContentWithRetry(
  ai: GoogleGenAI,
  params: GenerateContentParameters,
  args: {
    operation?: string;
    retryPolicy?: Partial<ProviderRetryPolicy>;
    onText?: (fragment: string) => Promise<void> | void;
  } = {}
): Promise<GenerateContentResponse> {
  const operation = args.operation ?? "generateContentStream";
  let delivered = false;

  return await withProviderRetry({
    providerKey: GOOGLE_VERTEX_PROVIDER_KEY,
    providerName: "Google Vertex AI",
    operation,
    policy: args.retryPolicy,
    // Retrying after the reader has seen text would replay the answer.
    shouldRetry: () => !delivered,
    onRetry: (event) => logGoogleRetry(event),
  }, async () => {
    const stream = await ai.models.generateContentStream(params);

    let text = "";
    const functionCalls: NonNullable<GenerateContentResponse["functionCalls"]> = [];
    let usageMetadata: GenerateContentResponse["usageMetadata"];

    for await (const chunk of stream) {
      // Usage is reported cumulatively, so the last chunk carrying it wins.
      if (chunk.usageMetadata) usageMetadata = chunk.usageMetadata;
      if (chunk.functionCalls?.length) functionCalls.push(...chunk.functionCalls);

      const fragment = chunk.text ?? "";
      if (!fragment) continue;

      text += fragment;
      delivered = true;
      await args.onText?.(fragment);
    }

    return {
      text,
      functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
      usageMetadata,
    } as GenerateContentResponse;
  });
}

/**
 * Upload a prompt prefix as a reusable cache object.
 *
 * Returns the cache's name, or `undefined` if anything at all went wrong. That
 * is the whole contract: caching is an optimisation, and an optimisation must
 * never be the reason a run fails. Providers reject caches for reasons that vary
 * by model and change over time — too few tokens, an unsupported model, a
 * feature not enabled on the project — and none of those are worth surfacing to
 * someone waiting for an answer. The run simply pays full price.
 *
 * Deliberately not retried. If cache creation is failing, the run should get on
 * with its work rather than spend its budget trying again.
 */
export async function createVertexPromptCache(
  ai: GoogleGenAI,
  params: {
    model: string;
    contents: Content[];
    systemInstruction?: string;
    tools?: Tool[];
    ttlSeconds: number;
    displayName?: string;
  },
): Promise<string | undefined> {
  try {
    const cache = await ai.caches.create({
      model: params.model,
      config: {
        contents: params.contents,
        systemInstruction: params.systemInstruction,
        tools: params.tools,
        ttl: `${params.ttlSeconds}s`,
        displayName: params.displayName,
      },
    });

    return cache.name ?? undefined;
  } catch (error) {
    console.warn("Prompt cache creation failed; continuing without it", {
      providerKey: GOOGLE_VERTEX_PROVIDER_KEY,
      model: params.model,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

/**
 * Release a cache object.
 *
 * Also silent on failure: the cache carries a TTL, so the worst case of a failed
 * delete is that it lingers for a few minutes rather than leaking indefinitely.
 * Reporting it as a run failure would be out of all proportion.
 */
export async function deleteVertexPromptCache(ai: GoogleGenAI, name: string) {
  try {
    await ai.caches.delete({ name });
  } catch (error) {
    console.warn("Prompt cache deletion failed; it will expire on its TTL", {
      providerKey: GOOGLE_VERTEX_PROVIDER_KEY,
      error: error instanceof Error ? error.message : String(error),
    });
  }
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
