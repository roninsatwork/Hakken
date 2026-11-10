import { GoogleGenAI } from "@google/genai";
import type {
  Content,
  EmbedContentParameters,
  EmbedContentResponse,
  GenerateContentParameters,
  GenerateContentResponse,
  Tool,
} from "@google/genai";
import { GOOGLE_VERTEX_EMBEDDING_LOCATION, GOOGLE_VERTEX_PROVIDER_KEY } from "./aiModelService";
import { withProviderRetry, type ProviderRetryPolicy } from "./aiProviderRetryService";
import { appError } from "./utils/appError";

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

export const DEFAULT_VERTEX_PROJECT = "hakken-509309";
export const DEFAULT_VERTEX_LOCATION = "global";

/**
 * Where Hakken's writing goes, and which of Google's addresses it calls: every
 * answer, agent turn and prompt cache asks with `createVertexGenAIClient(VERTEX_TEXT_CLIENT)`.
 *
 * On trial on dev from 2026-11-10 (Anthony, "Yes, try it"). Another app on this
 * library found `global` took up to 117 seconds for a four-word request and `eu`
 * ran past Google's own deadline, while `us` answered in under three. The library
 * calls Vertex's older `v1beta1` address unless told otherwise, and 3.0.0 still
 * does; Google's guide for Gemini 3.8 Flash calls `v1`. Both of Hakken's writing
 * models, 3.8 Flash and 4 Argon, are offered in `us`.
 *
 * The model list and speech stay on the configured location and the library's
 * own address, and embeddings keep their own region.
 */
export const VERTEX_TEXT_CLIENT = { location: "us", apiVersion: "v1" } as const;

export function buildVertexProviderConfig(args: {
  env: VertexProviderEnv;
  location?: string;
}): VertexProviderConfig {
  const clientEmail = args.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = args.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw appError("NOT_CONFIGURED", "Vertex AI credentials are missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY.");
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

export function createVertexGenAIClient(args: { env?: VertexProviderEnv; location?: string; apiVersion?: string } = {}) {
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
    // Unset, the library calls Vertex's `v1beta1` address.
    ...(args.apiVersion ? { apiVersion: args.apiVersion } : {}),
    googleAuthOptions: {
      credentials: config.credentials,
    },
  });
}

/**
 * A client pinned to the region that serves the embedding model.
 *
 * Embeddings cannot share the generation client. Asked of Vertex, the `global`
 * endpoint this project generates on offers no `text-embedding-*` model at all, so
 * every embedding call made through the generation client returned a provider
 * NOT_FOUND — silently, because each caller logs retrieval failures and continues.
 *
 * Kept as its own factory rather than a location argument at each call site, so a
 * new embedding caller gets the right region by default instead of having to know
 * this.
 */
export function createVertexEmbeddingClient(args: { env?: VertexProviderEnv } = {}) {
  return createVertexGenAIClient({ env: args.env, location: GOOGLE_VERTEX_EMBEDDING_LOCATION });
}

/** What the catalogue needs from a listed model, and nothing more. */
export type VertexCatalogueModel = {
  modelId: string;
  displayName: string;
  description?: string;
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  supportedActions?: string[];
};

/** Vertex returns `publishers/google/gemini-2.5-flash`; the catalogue wants the last part. */
export function parseVertexModelId(resourceName: string | undefined) {
  if (!resourceName) return "";
  return resourceName.split("/").filter(Boolean).at(-1) ?? "";
}

/**
 * What a Vertex model will take, worked out from its id.
 *
 * Gemini 3.8 Flash and Gemini 4 Argon (Google's guides, read 2026-11-09)
 * changed what a request may carry:
 *
 * - `temperature`, `topP` and `topK` are ignored from Gemini 3 on. Sending one
 *   asks for something the model will not do.
 * - `MINIMAL` thinking returns an error on Gemini 3.8 Flash, Gemini 4 and the
 *   Pro models. Google lists it only for Gemini 3 Flash up to 3.6 and for
 *   Flash-Lite. 3.7 Flash's own table leaves it out, so it is treated as gone.
 * - An explicit prompt cache (`caches.create`, `cachedContent`) returns an error
 *   on Gemini 4. Its implicit cache is on by default instead.
 *
 * A rule on the version in the id, not a list of models, so the next release
 * is covered on the day it ships. An id that is not a Gemini model keeps
 * today's behaviour: nothing is held back that might have worked.
 */
export type VertexModelRules = {
  honoursTemperature: boolean;
  takesMinimalThinking: boolean;
  takesPromptCache: boolean;
};

// The family is any word: Gemini 4's first model is `gemini-4-argon`, neither
// Pro nor Flash.
const VERTEX_GEMINI_ID = /^gemini-(\d+)(?:\.(\d+))?-([a-z]+)(-lite)?/;

export function vertexModelRules(providerModelId: string): VertexModelRules {
  const match = VERTEX_GEMINI_ID.exec(parseVertexModelId(providerModelId).toLowerCase());
  if (!match) return { honoursTemperature: true, takesMinimalThinking: true, takesPromptCache: true };

  const major = Number(match[1]);
  const minor = Number(match[2] ?? 0);
  const flash = match[3] === "flash";
  const lite = match[4] !== undefined;

  return {
    honoursTemperature: major < 3,
    takesMinimalThinking: major < 3 || (major === 3 && flash && (lite || minor < 7)),
    takesPromptCache: major < 4,
  };
}

/**
 * Text generation unless the id says otherwise.
 *
 * This used to be `isUsableVertexModel`, and its `false` meant the model was
 * dropped from the sync — image, video, speech and non-Gemini entries never
 * reached the catalogue. The catalogue now lists everything Vertex returns, so
 * this answers a smaller question: which tags a model gets, not whether it
 * exists. It also no longer requires the `gemini` prefix — that was an
 * allowlist by another name, and a family Google renames tomorrow would have
 * silently vanished.
 */
export function isVertexTextGenerationModel(modelId: string) {
  const normalized = modelId.toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("embedding")) return false;
  return !(
    normalized.includes("image")
    || normalized.includes("vision-tuning")
    || normalized.includes("live")
    || normalized.includes("tts")
    || normalized.includes("audio")
    || normalized.includes("veo")
  );
}

/**
 * Every model Vertex will admit to, asked of Vertex.
 *
 * This did not exist. `syncGoogleVertexModelCatalogue` carried a list of six
 * model ids typed into the source, above a comment explaining that the SDK's
 * listing "does not currently support Vertex AI perfectly in some beta SDK
 * versions" — true when it was written, and long out of date. The consequence
 * was that pressing Sync could never discover a model Google had released, and
 * the screen gave no sign that was the case.
 *
 * `queryBase: true` is what asks for publisher base models rather than the
 * project's own tuned ones.
 */
export async function listVertexModels(
  ai: GoogleGenAI,
  args: { pageLimit?: number } = {}
): Promise<VertexCatalogueModel[]> {
  const pageLimit = args.pageLimit ?? 10;
  const collected: VertexCatalogueModel[] = [];
  const seen = new Set<string>();

  const pager = await ai.models.list({ config: { queryBase: true, pageSize: 100 } });

  // `nextPage()` advances the pager and returns the new page's items — it does
  // not return a pager. Assigning it back over `pager` left the second
  // iteration reading `.page` off a plain array, which is undefined: the sync
  // failed with "page is not iterable" the moment Vertex returned more than
  // one page.
  let page = pager.page;

  for (let pageCount = 0; pageCount < pageLimit; pageCount += 1) {
    for (const model of page) {
      const modelId = parseVertexModelId(model.name);
      if (!modelId || seen.has(modelId)) continue;
      seen.add(modelId);
      collected.push({
        modelId,
        displayName: model.displayName || modelId,
        description: model.description,
        contextWindowTokens: model.inputTokenLimit,
        maxOutputTokens: model.outputTokenLimit,
        supportedActions: model.supportedActions,
      });
    }

    if (!pager.hasNextPage()) break;
    page = await pager.nextPage();
  }

  return collected;
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
 * A function call as the model asked for it, signature included.
 *
 * Gemini 3 attaches an opaque `thoughtSignature` to each `functionCall` part and
 * rejects the next turn if it does not come back. The SDK's `functionCalls`
 * accessor returns `FunctionCall` objects, and `thoughtSignature` is not on
 * `FunctionCall` — it sits beside it on the enclosing `Part`. So reading through
 * the accessor silently drops it, and the run fails one turn later with
 * "Function call is missing a thought_signature in functionCall parts".
 *
 * Carrying it on the call itself keeps one list rather than a list of calls and
 * a parallel list of signatures to be matched up by position.
 *
 * `id` is the call's own id, where the model gives one. Gemini 3.8 Flash and
 * Gemini 4 require the answer to a call to carry the same id and name, so it
 * travels with the call and goes back on the function response.
 */
export type VertexFunctionCall = {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
  thoughtSignature?: string;
};

export type VertexStreamResponse = {
  text: string;
  functionCalls?: VertexFunctionCall[];
  usageMetadata?: GenerateContentResponse["usageMetadata"];
};

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
): Promise<VertexStreamResponse> {
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
    const functionCalls: VertexFunctionCall[] = [];
    let usageMetadata: GenerateContentResponse["usageMetadata"];

    for await (const chunk of stream) {
      // Usage is reported cumulatively, so the last chunk carrying it wins.
      if (chunk.usageMetadata) usageMetadata = chunk.usageMetadata;

      // Read the raw parts rather than `chunk.functionCalls`. The accessor is
      // the convenient one and was what this used, but it hands back only the
      // call — the thought signature lives beside it on the part and has to
      // come back on the next turn or the model rejects it.
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        if (!part.functionCall) continue;
        functionCalls.push({
          ...(part.functionCall.id ? { id: part.functionCall.id } : {}),
          name: part.functionCall.name,
          args: part.functionCall.args as Record<string, unknown> | undefined,
          thoughtSignature: part.thoughtSignature,
        });
      }

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
    };
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
