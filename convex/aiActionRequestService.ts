export function assertWithinAiActionRateLimit(
  recentRequests: Array<{ requestedAt: number }>,
  args: { now: number; windowMs: number; maxRequests: number }
) {
  const threshold = args.now - args.windowMs;
  const requestsInWindow = recentRequests.filter((request) => request.requestedAt > threshold).length;
  if (requestsInWindow >= args.maxRequests) {
    throw new Error("429 Too Many Requests: Please wait before trying this AI action again.");
  }
}
