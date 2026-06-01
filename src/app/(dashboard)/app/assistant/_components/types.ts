import type { Doc } from "@/convex/_generated/dataModel";

export type AssistantModel = Doc<"aiModels">;

export type Translate = (key: string, values?: Record<string, string>) => string;
