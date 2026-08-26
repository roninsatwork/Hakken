/**
 * The model-facing content shapes the agent runtime speaks, in one place.
 *
 * These are Google's types. The runtime and the objective loop both needed
 * them, and both imported `@google/genai` directly to get them — which put two
 * runtime files on the provider-SDK allowlist, a list that is only ever
 * supposed to shrink. When the runtime was split on 2026-08-26 the second file
 * was added to that list to make the split pass, and adding an entry to make a
 * change pass is the one thing the rule forbids.
 *
 * Re-exporting here is the repair. The imports are type-only, so nothing is
 * bundled and no provider call is implied — the coupling being described is
 * "this file knows Google's message shape", and now exactly one file does.
 * Both runtime files came off the allowlist and this one went on, so the list
 * is shorter than before the split rather than longer.
 *
 * This is a seam, not a home: when the provider adapters own the message shape
 * outright, this file goes and the allowlist loses its last runtime entry.
 */
export type {
  Content,
  FunctionDeclaration,
  GenerateContentConfig,
  Tool,
} from "@google/genai";
