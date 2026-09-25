import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * DataForSEO saying a task is ready.
 *
 * A pingback and not a postback, and the difference is the whole security
 * design of this route. DataForSEO's callback cannot carry an authorisation
 * header, so anything it sends arrives unauthenticated and anyone who guesses
 * the URL can send it. A *result* delivered that way could poison the record
 * with numbers we never bought, so we take only the task id and then ask
 * DataForSEO ourselves, over authenticated HTTPS, what the task actually says.
 * Collecting a result is free — the charge was taken when the task was set —
 * so there is no saving in trusting the caller.
 *
 * What follows from that:
 *
 *  - An id we did not send is a plain 200 and nothing else. That cheap miss is
 *    what stops a flood of invented ids turning into a flood of our own
 *    outbound requests.
 *  - The query string is never logged. It is attacker-chosen text.
 *  - Nothing is parsed here. Their callback times out in about ten seconds,
 *    and a handler that did real work would start failing at exactly the
 *    volume that makes it matter.
 */
export const handleSeoPingback = httpAction(async (ctx, request) => {
  const params = new URL(request.url).searchParams;
  const taskId = params.get("id");
  // Our own tag, echoed back: how a send we could not confirm is found again.
  const tag = params.get("tag");

  if (taskId && taskId.length <= MAX_TASK_ID) {
    const pullId = await ctx.runMutation(internal.seoCollectionQueue.markSeoPinged, {
      taskId,
      ...(tag && tag.length <= MAX_TAG ? { tag } : {}),
    });
    if (pullId) {
      await ctx.scheduler.runAfter(0, internal.seoCollectionActions.fetchSeoResult, { pullId });
    }
  }

  // Always 200, and always the same 200. A different answer for a known id
  // would turn this route into an oracle for which tasks we are running.
  return new Response(null, { status: 200 });
});

/**
 * DataForSEO's ids are UUID-shaped with a short prefix. The limit is here so a
 * caller cannot make us index a megabyte of query string.
 */
const MAX_TASK_ID = 128;

/** Our tags are idempotency keys, a few hundred characters at most. */
const MAX_TAG = 512;
