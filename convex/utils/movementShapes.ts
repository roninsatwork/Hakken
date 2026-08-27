import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import schema from "../schema";
import { rowShape } from "./rowShape";

/**
 * What the Posture Studio surfaces hand back.
 *
 * Declarations only. This is frozen code and nothing here changes what it does
 * — the shapes are written from what the handlers already return, including the
 * one narrowing they already perform: a debug session's `samplesJson` is the
 * raw capture blob, and the list replaces it with a preview rather than sending
 * it. The shape is what keeps that true.
 */

const sessionFields = schema.tables.movementDebugSessions.validator.fields;

export const movementListShape = v.array(rowShape.movements);

export const movementPageShape = paginationResultValidator(rowShape.movements);

export const movementOrNullShape = v.union(rowShape.movements, v.null());

export const replayAlignmentListShape = v.array(v.object({
  ...rowShape.movements.fields,
  poseDataUrl: v.union(v.string(), v.null()),
}));

export const debugSessionListShape = v.array(v.object({
  _id: v.id("movementDebugSessions"),
  _creationTime: v.number(),
  movementId: sessionFields.movementId,
  trigger: sessionFields.trigger,
  sampleCount: sessionFields.sampleCount,
  durationMs: sessionFields.durationMs,
  startedAt: sessionFields.startedAt,
  endedAt: sessionFields.endedAt,
  baselineSummary: sessionFields.baselineSummary,
  warningSummary: sessionFields.warningSummary,
  captureStartReadiness: sessionFields.captureStartReadiness,
  samplesPreview: v.string(),
  createdBy: sessionFields.createdBy,
  createdAt: sessionFields.createdAt,
}));

export const debugSessionOrNullShape = v.union(rowShape.movementDebugSessions, v.null());

export const debugSessionRowsShape = v.array(rowShape.movementDebugSessions);
