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

import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { GoogleAuth } from "google-auth-library";
import { WebSocket, WebSocketServer } from "ws";

const PORT = Number(process.env.PORT ?? 8787);
const RELAY_SECRET = process.env.VOICE_RELAY_SECRET ?? "";
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? "";
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1";
// A session that outlives this is a session nobody is talking to.
const MAX_SESSION_MS = 15 * 60 * 1000;

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

/**
 * The ticket says who is allowed to talk and what the session is. It is
 * signed by the platform, so this relay can trust its contents without
 * calling anything, and it expires in a minute — long enough to open a
 * connection, too short to be worth stealing.
 */
function readTicket(raw) {
  const [payloadPart, signaturePart] = String(raw ?? "").split(".");
  if (!payloadPart || !signaturePart) throw new Error("Malformed ticket.");

  const expected = createHmac("sha256", RELAY_SECRET).update(payloadPart).digest();
  const provided = Buffer.from(signaturePart, "base64url");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    throw new Error("Bad ticket signature.");
  }

  const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  if (typeof payload.expiresAt !== "number" || payload.expiresAt < Date.now()) {
    throw new Error("Ticket expired.");
  }
  if (!payload.model) throw new Error("Ticket names no model.");
  return payload;
}

/** The setup Vertex expects before any audio flows. */
function buildSetup(ticket) {
  return {
    setup: {
      model: `projects/${PROJECT}/locations/${LOCATION}/publishers/google/models/${ticket.model}`,
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: ticket.voice
          ? { voiceConfig: { prebuiltVoiceConfig: { voiceName: ticket.voice } } }
          : undefined,
      },
      // The company's rules arrive from the platform, never from the page:
      // a browser can rewrite anything it is given, so it is given nothing.
      systemInstruction: ticket.instructions
        ? { parts: [{ text: ticket.instructions }] }
        : undefined,
      // Both sides transcribed so the conversation can be written back into
      // the thread as ordinary messages.
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    },
  };
}

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

relay.on("connection", (browser) => {
  let vertex = null;
  let closing = false;
  const pending = [];

  const shutdown = (code, reason) => {
    if (closing) return;
    closing = true;
    clearTimeout(sessionTimer);
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

  browser.on("message", async (data, isBinary) => {
    // Everything after the ticket is audio, forwarded as it arrives.
    if (vertex) {
      if (vertex.readyState !== WebSocket.OPEN) return;
      if (isBinary) {
        vertex.send(
          JSON.stringify({
            realtimeInput: {
              mediaChunks: [
                { mimeType: "audio/pcm;rate=16000", data: Buffer.from(data).toString("base64") },
              ],
            },
          })
        );
      } else {
        // Control messages from the page are passed through untouched except
        // for setup, which only this relay may send.
        const text = data.toString();
        if (!text.includes('"setup"')) vertex.send(text);
      }
      return;
    }

    let ticket;
    try {
      ticket = readTicket(JSON.parse(data.toString()).ticket);
    } catch (error) {
      shutdown(4401, error instanceof Error ? error.message : "Refused.");
      return;
    }

    try {
      const token = await auth.getAccessToken();
      vertex = new WebSocket(
        `wss://${LOCATION}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      vertex.on("open", () => {
        vertex.send(JSON.stringify(buildSetup(ticket)));
        for (const queued of pending.splice(0)) vertex.send(queued);
        browser.send(JSON.stringify({ type: "relay.ready" }));
      });

      vertex.on("message", (payload) => {
        if (browser.readyState === WebSocket.OPEN) browser.send(payload.toString());
      });

      vertex.on("close", () => shutdown(1000, "Vertex closed the session."));
      vertex.on("error", (error) => {
        console.error("Vertex socket error", error?.message ?? error);
        shutdown(1011, "Vertex connection failed.");
      });
    } catch (error) {
      console.error("Could not reach Vertex", error?.message ?? error);
      shutdown(1011, "Could not reach Vertex.");
    }
  });

  browser.on("close", () => shutdown(1000, "Caller hung up."));
  browser.on("error", () => shutdown(1011, "Browser connection failed."));
});

server.listen(PORT, () => {
  console.log(`Voice relay listening on ${PORT}, Vertex ${PROJECT}/${LOCATION}`);
});
