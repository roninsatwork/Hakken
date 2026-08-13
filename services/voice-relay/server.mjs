/**
 * The live voice relay.
 *
 * Vertex issues no browser-safe credential — its only key is the service
 * account, which is a key to the whole Google project and must never reach a
 * web page. So the audio takes one hop through here: the browser holds a
 * socket to this relay, this relay holds the socket to Vertex, and the
 * service account never leaves the server. That is the architecture Google's
 * own Vertex samples use, and it is what lets real-time voice run on Google's
 * live native-audio model, which costs a fraction of the alternatives per
 * spoken minute.
 *
 * It is deliberately small and stateless: no database, no user records, no
 * storage. Everything it needs to run a session arrives in a signed ticket
 * minted by the platform, and it refuses anything else.
 *
 * Run it anywhere that speaks WebSocket. On Google Cloud Run in the same
 * project the credentials come from the environment with no key file at all.
 *
 *   PORT                  the port to listen on (Cloud Run sets this)
 *   VOICE_RELAY_SECRET    shared with the platform; signs the ticket
 *   GOOGLE_CLOUD_PROJECT  the Vertex project
 *   GOOGLE_CLOUD_LOCATION the Vertex region
 *   GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY   only when not on Google Cloud
 */

import { createServer } from "node:http";
import { GoogleAuth } from "google-auth-library";
import { WebSocket, WebSocketServer } from "ws";
import {
  buildSetup,
  buildToolResponse,
  createCallerRouter,
  readToolCalls,
} from "./protocol.mjs";

const PORT = Number(process.env.PORT ?? 8787);
const RELAY_SECRET = process.env.VOICE_RELAY_SECRET ?? "";
// Where the platform answers a knowledge lookup. Absent means the spoken
// session simply cannot look anything up — it still talks, and says so.
const KNOWLEDGE_URL = process.env.VOICE_KNOWLEDGE_URL ?? "";
// The model is holding its turn while this runs, so it cannot be allowed to
// hold it indefinitely: better a plain "I could not check" than dead air.
const KNOWLEDGE_TIMEOUT_MS = 8000;
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? "";
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1";
// A session that outlives this is a session nobody is talking to.
const MAX_SESSION_MS = 15 * 60 * 1000;
// The caller starts talking the instant the socket opens, while this relay is
// still fetching its Google token. That audio is held rather than dropped, but
// only so much of it: if Vertex never opens, this is a leak.
const MAX_HELD_FRAMES = 200;

if (!RELAY_SECRET) throw new Error("VOICE_RELAY_SECRET is required.");
if (!PROJECT) throw new Error("GOOGLE_CLOUD_PROJECT is required.");

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  ...(process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY
    ? {
        credentials: {
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        },
      }
    : {}),
});

const server = createServer((request, response) => {
  // Cloud Run wants a plain health endpoint.
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
    return;
  }
  response.writeHead(426, { "content-type": "text/plain" });
  response.end("This endpoint speaks WebSocket.");
});

const relay = new WebSocketServer({ server });
let sessionCount = 0;

relay.on("connection", (browser) => {
  const id = (sessionCount += 1);
  const say = (message, ...rest) => console.log(`[session ${id}] ${message}`, ...rest);

  let vertex = null;
  let closing = false;
  // Owns the ticket-then-conversation ordering, and holds whatever the caller
  // says while Vertex is still being opened. See protocol.mjs for why that
  // ordering has to be decided synchronously.
  const router = createCallerRouter({ secret: RELAY_SECRET, maxHeldFrames: MAX_HELD_FRAMES });

  say("caller connected");

  const shutdown = (code, reason) => {
    if (closing) return;
    closing = true;
    clearTimeout(sessionTimer);
    say(`closing (${code}): ${reason}`);
    try {
      browser.close(code, reason);
    } catch {
      /* already gone */
    }
    try {
      vertex?.close();
    } catch {
      /* already gone */
    }
  };

  const sessionTimer = setTimeout(() => shutdown(1000, "Session ended."), MAX_SESSION_MS);

  /**
   * Look the question up and hand the answer straight back to Vertex.
   *
   * Every failure here ends in a sentence the model can say out loud. A
   * spoken session that goes quiet because a lookup failed is worse than one
   * that admits it could not check — the caller has no way to tell the
   * difference between thinking and broken.
   */
  const answerToolCalls = async (calls, rawTicket) => {
    const results = await Promise.all(
      calls.map(async (call) => {
        if (!KNOWLEDGE_URL) {
          return { ...call, output: "Knowledge search is unavailable. Say you cannot check." };
        }
        try {
          const response = await fetch(KNOWLEDGE_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ticket: rawTicket, query: String(call.args?.query ?? "") }),
            signal: AbortSignal.timeout(KNOWLEDGE_TIMEOUT_MS),
          });
          if (!response.ok) {
            console.warn(`[session ${id}] knowledge lookup refused: ${response.status}`);
            return { ...call, output: "The knowledge search failed. Say you could not check." };
          }
          const body = await response.json();
          return {
            ...call,
            output:
              body.context || "Nothing in the company's knowledge covers that. Say so plainly.",
          };
        } catch (error) {
          console.warn(`[session ${id}] knowledge lookup failed:`, error?.message ?? error);
          return { ...call, output: "The knowledge search failed. Say you could not check." };
        }
      })
    );

    if (vertex?.readyState === WebSocket.OPEN) {
      vertex.send(buildToolResponse(results));
      say(`answered ${results.length} knowledge lookup(s)`);
    }
  };

  const openVertex = async (ticket, rawTicket) => {
    let token;
    try {
      token = await auth.getAccessToken();
    } catch (error) {
      console.error(`[session ${id}] no Google credential`, error?.message ?? error);
      shutdown(1011, "Could not authenticate with Vertex.");
      return;
    }
    if (closing) return;

    say(`opening Vertex ${PROJECT}/${LOCATION} for ${ticket.model}`);
    vertex = new WebSocket(
      `wss://${LOCATION}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    vertex.on("open", () => {
      vertex.send(JSON.stringify(buildSetup(ticket, PROJECT, LOCATION)));
      const queued = router.release();
      for (const frame of queued) vertex.send(frame);
      say(`Vertex open, released ${queued.length} held frame(s)`);
      browser.send(JSON.stringify({ type: "relay.ready" }));
    });

    vertex.on("message", (payload) => {
      const text = payload.toString();
      // Forwarded first, always: the caller's screen uses these frames to
      // show what is being said, and a lookup is what makes it show that it
      // is thinking. Answering the lookup is this relay's job, not the
      // page's — a phone call has no page.
      if (browser.readyState === WebSocket.OPEN) browser.send(text);

      const calls = readToolCalls(text);
      if (calls.length > 0) void answerToolCalls(calls, rawTicket);
    });

    vertex.on("close", (code, reason) =>
      shutdown(1000, `Vertex closed the session (${code}): ${reason?.toString() || "no reason"}`)
    );
    vertex.on("error", (error) => {
      console.error(`[session ${id}] Vertex socket error`, error?.message ?? error);
      shutdown(1011, "Vertex connection failed.");
    });
  };

  browser.on("message", (data, isBinary) => {
    const decision = router.receive(data, isBinary);
    switch (decision.kind) {
      case "ticket":
        say("ticket accepted");
        void openVertex(decision.ticket, decision.rawTicket);
        return;
      case "refused":
        // Logged, not silent: a refused ticket used to look exactly like a
        // caller who never arrived, which is a bad hour to spend.
        console.warn(`[session ${id}] refused the ticket:`, decision.reason);
        shutdown(4401, decision.reason);
        return;
      case "send":
        if (vertex?.readyState === WebSocket.OPEN) vertex.send(decision.frame);
        return;
      default:
        return;
    }
  });

  browser.on("close", () => shutdown(1000, "Caller hung up."));
  browser.on("error", () => shutdown(1011, "Browser connection failed."));
});

server.listen(PORT, () => {
  console.log(`Voice relay listening on ${PORT}, Vertex ${PROJECT}/${LOCATION}`);
});
