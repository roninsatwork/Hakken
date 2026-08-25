import { appError } from "./utils/appError";

export function assertWithinAiActionRateLimit(
  recentRequests: Array<{ requestedAt: number }>,
  args: { now: number; windowMs: number; maxRequests: number }
) {
  const threshold = args.now - args.windowMs;
  const requestsInWindow = recentRequests.filter((request) => request.requestedAt > threshold).length;
  if (requestsInWindow >= args.maxRequests) {
    throw appError("INVALID_INPUT", "429 Too Many Requests: Please wait before trying this AI action again.");
  }
}
