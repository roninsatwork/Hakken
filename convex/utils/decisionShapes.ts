import { v } from "convex/values";

/** The Decision vocabulary, spelt once for the schema and the functions that read it. */
export const decisionModeValidator = v.union(v.literal("OFF"), v.literal("ASK_A_PERSON"), v.literal("ACT"));
export const decisionCertaintyValidator = v.union(v.literal("SURE"), v.literal("FAIRLY_SURE"), v.literal("NOT_SURE"));
export const decisionOutcomeValidator = v.union(v.literal("ACTED"), v.literal("HANDED_TO_PERSON"), v.literal("RECORDED"));
export const decisionSourceValidator = v.union(v.literal("TYPESAFE"), v.literal("TEXT_MODEL"), v.literal("RULES"));
export const decisionFallbackReasonValidator = v.union(v.literal("MODE_OFF"), v.literal("NO_MODEL"), v.literal("PROVIDER_FAILED"));
