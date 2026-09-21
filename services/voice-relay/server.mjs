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
 * It is deliberately small: no local database, user records, or durable
 * storage. Everything it needs to run a session arrives in a signed ticket
 * minted by the platform, whose one-time id is redeemed with the platform
 * before provider access begins.
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
import { createHmac } from "node:crypto";
import { GoogleAuth } from "google-auth-library";
import { WebSocket, WebSocketServer } from "ws";
import {
  buildSetup,
  buildToolResponse,
  classifyUpgradePath,
  createCallerRouter,
  createTicketReplayGuard,
  isTurnComplete,
  pcm16HasSpeech,
  readToolCalls,
} from "./protocol.mjs";
import {
  buildGreetingNudge,
  buildTwilioClear,
  buildTwilioMedia,
  createTranscriptCollector,
  modelAudioToPhonePayloads,
  phonePayloadToModelFrame,
  readModelSpeech,
  readTwilioFrame,
} from "./twilioBridge.mjs";

const PORT = Number(process.env.PORT ?? 8787);
const RELAY_SECRET = process.env.VOICE_RELAY_SECRET ?? "";
// Where the platform answers a knowledge lookup. Absent means the spoken
// session simply cannot look anything up — it still talks, and says so.
const KNOWLEDGE_URL = process.env.VOICE_KNOWLEDGE_URL ?? "";
// Where a call's transcript is filed, turn by turn, as it happens. Derived
// from the knowledge URL because they are the same platform — stated
// separately only if a deployment needs them apart.
const TURNS_URL =
  process.env.VOICE_TURNS_URL ??
  (KNOWLEDGE_URL ? KNOWLEDGE_URL.replace(/\/api\/voice\/knowledge$/, "/api/telephony/turns") : "");
// The model is holding its turn while this runs, so it cannot be allowed to
// hold it indefinitely: better a plain "I could not check" than dead air.
const KNOWLEDGE_TIMEOUT_MS = 8000;
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? "";
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1";
// A session that outlives this is a session nobody is talking to.
const MAX_SESSION_MS = 15 * 60 * 1000;
// A signed ticket can carry a large company prompt, but microphone frames and
// control messages are small. Keep the unauthenticated parser well below ws's
// 100MB default.
const MAX_CALLER_PAYLOAD_BYTES = 128 * 1024;
const PRE_AUTH_TIMEOUT_MS = 5_000;
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

const relay = new WebSocketServer({ noServer: true, maxPayload: MAX_CALLER_PAYLOAD_BYTES });
const phoneDoor = new WebSocketServer({ noServer: true, maxPayload: MAX_CALLER_PAYLOAD_BYTES });
const replayGuard = createTicketReplayGuard();
let sessionCount = 0;

// Two doors, one loop. A browser connects to the root and speaks the session
// protocol directly. The telephony provider connects to /twilio and speaks
// its own dialect — which the bridge below translates into the same session
// protocol, over a loopback connection to the root. The phone is therefore
// exactly "the browser's loop with a different microphone", and everything
// the session path does (the ticket, the held frames, the knowledge
// answering) happens once, in one place.
server.on("upgrade", (request, socket, head) => {
  const path = new URL(request.url ?? "/", "http://relay.local").pathname;
  const door = classifyUpgradePath(path);
  if (door === "phone") {
    phoneDoor.handleUpgrade(request, socket, head, (connection) =>
      phoneDoor.emit("connection", connection, request)
    );
    return;
  }
  if (door !== "relay") {
    socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  relay.handleUpgrade(request, socket, head, (connection) =>
    relay.emit("connection", connection, request)
  );
});

relay.on("connection", (browser) => {
  const id = (sessionCount += 1);
  const say = (message, ...rest) => console.log(`[session ${id}] ${message}`, ...rest);

  let vertex = null;
  let closing = false;
  let admittedTicket;
  let admittedPayload;
  let sessionPayload;
  let turnIndex = 1;
  let turnState = "idle";
  const meteredFrames = [];
  const relayHeaders = (ticket) => ({
    "content-type": "application/json",
    "x-voice-relay-auth": createHmac("sha256", RELAY_SECRET).update(ticket).digest("base64url"),
  });
  // Owns the ticket-then-conversation ordering, and holds whatever the caller
  // says while Vertex is still being opened. See protocol.mjs for why that
  // ordering has to be decided synchronously.
  const router = createCallerRouter({
    secret: RELAY_SECRET,
    maxHeldFrames: MAX_HELD_FRAMES,
    claimTicket: (ticket) => replayGuard.claim(ticket),
  });

  say("caller connected");
  const ticketTimer = setTimeout(
    () => shutdown(4401, "Ticket was not presented in time."),
    PRE_AUTH_TIMEOUT_MS
  );

  const postControl = async (action, index) => {
    if (!admittedTicket || !admittedPayload?.controlUrl) return { ok: true };
    const response = await fetch(admittedPayload.controlUrl, {
      method: "POST",
      headers: relayHeaders(admittedTicket),
      body: JSON.stringify({
        ticket: admittedTicket,
        action,
        ...(index !== undefined ? { turnIndex: index } : {}),
      }),
      signal: AbortSignal.timeout(KNOWLEDGE_TIMEOUT_MS),
    });
    return { ok: response.ok, status: response.status };
  };

  const shutdown = (code, reason) => {
    if (closing) return;
    closing = true;
    clearTimeout(ticketTimer);
    clearTimeout(sessionTimer);
    if (admittedTicket) {
      if (admittedPayload?.controlUrl) {
        void postControl("close").catch(() => {});
      } else if (KNOWLEDGE_URL) {
        void fetch(KNOWLEDGE_URL, {
          method: "POST", headers: relayHeaders(admittedTicket),
          body: JSON.stringify({ ticket: admittedTicket, close: true }),
          signal: AbortSignal.timeout(KNOWLEDGE_TIMEOUT_MS),
        }).catch(() => {});
      }
    }
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

  const deliverCallerDecision = (decision) => {
    if (decision.kind === "send" && vertex?.readyState === WebSocket.OPEN) vertex.send(decision.frame);
  };

  const beginMeteredTurn = async () => {
    if (!admittedPayload || turnState !== "idle" || meteredFrames.length === 0) return;
    turnState = "beginning";
    try {
      const admission = await postControl("begin-turn", turnIndex);
      if (!admission.ok) {
        if (browser.readyState === WebSocket.OPEN) {
          browser.send(JSON.stringify({ type: "relay.quota" }));
        }
        shutdown(1000, admission.status === 429 ? "Company voice allowance exhausted." : "Turn admission refused.");
        return;
      }
      turnState = "open";
      for (const frame of meteredFrames.splice(0)) {
        deliverCallerDecision(router.receive(frame, true));
      }
    } catch (error) {
      console.warn(`[session ${id}] turn admission failed:`, error?.message ?? error);
      shutdown(1011, "Turn admission unavailable.");
    }
  };

  const completeMeteredTurn = async () => {
    if (turnState !== "open") return;
    turnState = "completing";
    try {
      const completion = await postControl("complete-turn", turnIndex);
      if (!completion.ok) {
        shutdown(1011, "Turn completion unavailable.");
        return;
      }
      turnIndex += 1;
      turnState = "idle";
      if (meteredFrames.length > 0) void beginMeteredTurn();
    } catch (error) {
      console.warn(`[session ${id}] turn completion failed:`, error?.message ?? error);
      shutdown(1011, "Turn completion unavailable.");
    }
  };

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
            headers: relayHeaders(rawTicket),
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
    try {
      const redemption = await fetch(ticket.redemptionUrl, {
        method: "POST",
        headers: relayHeaders(rawTicket),
        body: JSON.stringify({ ticket: rawTicket }),
        signal: AbortSignal.timeout(PRE_AUTH_TIMEOUT_MS),
      });
      if (!redemption.ok) {
        shutdown(4401, redemption.status === 409 ? "Ticket already used." : "Ticket redemption refused.");
        return;
      }
      admittedTicket = rawTicket;
      admittedPayload = ticket;
      if (meteredFrames.length > 0) void beginMeteredTurn();
      if (closing) {
        if (ticket.controlUrl) await postControl("close");
        else if (KNOWLEDGE_URL) await fetch(KNOWLEDGE_URL, {
            method: "POST", headers: relayHeaders(rawTicket),
            body: JSON.stringify({ ticket: rawTicket, close: true }),
            signal: AbortSignal.timeout(KNOWLEDGE_TIMEOUT_MS),
          });
        return;
      }
    } catch (error) {
      console.warn(`[session ${id}] ticket redemption failed:`, error?.message ?? error);
      shutdown(1011, "Ticket redemption unavailable.");
      return;
    }

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
      if (ticket.meteredVoiceTurns && isTurnComplete(text)) void completeMeteredTurn();
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
    if (sessionPayload?.meteredVoiceTurns && isBinary && turnState !== "open") {
      const frame = Buffer.from(data);
      if (meteredFrames.length === 0 && !pcm16HasSpeech(frame)) return;
      if (meteredFrames.length < MAX_HELD_FRAMES) meteredFrames.push(frame);
      if (turnState === "idle") void beginMeteredTurn();
      return;
    }
    const decision = router.receive(data, isBinary);
    switch (decision.kind) {
      case "ticket":
        clearTimeout(ticketTimer);
        say("ticket accepted");
        sessionPayload = decision.ticket;
        void openVertex(decision.ticket, decision.rawTicket);
        return;
      case "refused":
        // Logged, not silent: a refused ticket used to look exactly like a
        // caller who never arrived, which is a bad hour to spend.
        console.warn(`[session ${id}] refused the ticket:`, decision.reason);
        shutdown(4401, decision.reason);
        return;
      case "send":
        deliverCallerDecision(decision);
        return;
      default:
        return;
    }
  });

  browser.on("close", () => shutdown(1000, "Caller hung up."));
  browser.on("error", () => shutdown(1011, "Browser connection failed."));
});

phoneDoor.on("connection", (phone) => {
  const id = (sessionCount += 1);
  const say = (message) => console.log(`[call ${id}] ${message}`);

  let session = null;
  let streamSid = "";
  let callSid = "";
  let ticket = "";
  let closing = false;
  const transcript = createTranscriptCollector();

  say("phone stream connected");

  const startTimer = setTimeout(
    () => shutdown("The provider did not start the call in time."),
    PRE_AUTH_TIMEOUT_MS
  );

  // The same ceiling the browser door has. A caller who never hangs up —
  // or a line that never delivers its end-of-call — must not hold a model
  // session open for the rest of the day.
  const callTimer = setTimeout(() => shutdown("Call reached its time limit."), MAX_SESSION_MS);

  /**
   * File finished turns on the call record, as they happen. Fire-and-forget
   * on purpose: the transcript must never hold up the audio, and a failed
   * post loses one exchange, not the call.
   */
  const fileTurns = (turns) => {
    if (turns.length === 0 || !TURNS_URL || !ticket || !callSid) return;
    fetch(TURNS_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticket, callSid, turns }),
      signal: AbortSignal.timeout(KNOWLEDGE_TIMEOUT_MS),
    }).catch((error) => say(`transcript post failed: ${error?.message ?? error}`));
  };

  const shutdown = (reason) => {
    if (closing) return;
    closing = true;
    clearTimeout(startTimer);
    clearTimeout(callTimer);
    say(`closing: ${reason}`);
    // The hang-up itself finishes the last exchange: whatever was said since
    // the previous turn boundary goes on the record before the line drops.
    fileTurns(transcript.end());
    try {
      phone.close();
    } catch {
      /* already gone */
    }
    try {
      session?.close();
    } catch {
      /* already gone */
    }
  };

  phone.on("message", (data) => {
    const frame = readTwilioFrame(data.toString());

    // The provider's `start` carries the pass the platform minted when it
    // answered the call. Only then is there a session to open.
    if (frame.kind === "start") {
      clearTimeout(startTimer);
      streamSid = frame.streamSid;
      callSid = frame.callSid;
      ticket = frame.ticket;
      if (!frame.ticket) {
        say("no ticket on the stream — refusing the call");
        shutdown("No ticket.");
        return;
      }

      // The loopback: the bridge is just another caller at the relay's own
      // front door, indistinguishable from a browser.
      session = new WebSocket(`ws://127.0.0.1:${PORT}/`);
      session.binaryType = "arraybuffer";

      session.on("open", () => {
        session.send(JSON.stringify({ ticket: frame.ticket }));
        say("session opened for the call");
      });

      session.on("message", (payload) => {
        const text = payload.toString();

        // The session is up: have Hakken speak first, the way a person
        // answering a phone does. A screen waits for you; a phone must not.
        if (text.includes('"relay.ready"')) {
          session.send(buildGreetingNudge());
          say("session ready — asked Hakken to greet the caller");
          return;
        }

        const speech = readModelSpeech(text);
        if (!speech || phone.readyState !== WebSocket.OPEN) return;

        // Each finished exchange goes straight on the call record — the
        // transcript exists the moment the words do, not at hang-up.
        fileTurns(transcript.hear(speech));

        // The caller talked over the reply. Everything already queued on the
        // line is abandoned speech — dropped now, or it plays for seconds.
        if (speech.interrupted) {
          phone.send(buildTwilioClear(streamSid));
        }
        if (speech.audioBase64) {
          for (const payload of modelAudioToPhonePayloads(speech.audioBase64)) {
            phone.send(buildTwilioMedia(streamSid, payload));
          }
        }
      });

      session.on("close", () => shutdown("Session ended."));
      session.on("error", (error) => {
        console.error(`[call ${id}] session error`, error?.message ?? error);
        shutdown("Session failed.");
      });
      return;
    }

    if (frame.kind === "media") {
      if (session?.readyState !== WebSocket.OPEN) return;
      // The session door expects binary PCM16 — the same bytes a browser
      // microphone sends — so the phone's audio is translated, not wrapped.
      session.send(phonePayloadToModelFrame(frame.payload));
      return;
    }

    if (frame.kind === "stop") {
      shutdown("Caller hung up.");
    }
  });

  phone.on("close", () => shutdown("Phone stream closed."));
  phone.on("error", () => shutdown("Phone stream failed."));
});

server.listen(PORT, () => {
  console.log(`Voice relay listening on ${PORT}, Vertex ${PROJECT}/${LOCATION}`);
});
