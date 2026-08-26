import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import schema from "../schema";
import { rowShape } from "./rowShape";

/**
 * What the chat-log screens hand back.
 *
 * `widgetAccessTokenHash` is deliberately absent, and this is the place it
 * matters most. `chat.ts` narrowed it out of a person's own history and called
 * that drift exposure, because a personal history holds no widget threads. The
 * admin chat logs are the opposite: widget-originated threads are exactly what
 * they exist to show, so every one of them was handing the hash a widget
 * session authenticates against to an administrator's browser.
 */

const threadFields = schema.tables.threads.validator.fields;

const threadUserShape = v.union(v.null(), v.object({
  name: v.string(),
  email: v.string(),
  image: v.string(),
}));

export const clientAdminThreadShape = v.object({
  _id: v.id("threads"),
  _creationTime: v.number(),
  userId: threadFields.userId,
  companyId: threadFields.companyId,
  agentId: threadFields.agentId,
  widgetId: threadFields.widgetId,
  sourceUrl: threadFields.sourceUrl,
  title: threadFields.title,
  purpose: threadFields.purpose,
  assistantStage: threadFields.assistantStage,
  assistantStageAt: threadFields.assistantStageAt,
  createdAt: threadFields.createdAt,
  updatedAt: threadFields.updatedAt,
  user: threadUserShape,
});

/** The narrowing the shape above describes. Kept beside it so neither drifts. */
export const toClientAdminThread = (thread: Doc<"threads">) => {
  const { widgetAccessTokenHash: _hash, ...rest } = thread;
  return rest;
};

export const offsetThreadPageShape = v.object({
  data: v.array(clientAdminThreadShape),
  totalPages: v.number(),
  totalCount: v.number(),
});

export const adminThreadPageShape = paginationResultValidator(clientAdminThreadShape);

export const adminThreadMessagesShape = v.array(rowShape.messages);
