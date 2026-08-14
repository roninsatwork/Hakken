"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { VoiceSessionState } from "@/src/lib/voiceSession";
import { decodePcm16Base64 } from "@/src/lib/voiceSession";
import {
  downsampleTo16k,
  LIVE_OUTPUT_SAMPLE_RATE,
  readLiveServerMessage,
} from "@/src/lib/googleLiveVoice";
import { SpeakingCharacter } from "@/src/ui/components/chat/SpeakingCharacter";

/**
 * The receptionist screen: a widget, presented differently.
 *
 * A tablet at a desk shows the sound-shape full screen; a visitor taps once
 * (browsers refuse microphone and audio without a gesture) and then simply
 * talks — the same live loop the dashboard voice uses, over the same relay,
 * on the same anonymous widget machinery as `/w/[widgetId]`.
 *
 * Everything unattended about it is deliberate: it forgets between visitors
 * (fresh thread and token per session, held only in memory), failure is a
 * calm "back shortly" rather than an error, the AI disclosure never leaves
 * the screen, and there is no navigation to wander off through.
 */

/** Silence handling: a gentle nudge, then the session ends for the next visitor. */
const STILL_THERE_AFTER_MS = 25_000;
const RESET_AFTER_MS = 45_000;

/** The overnight freshen-up hour (device-local): reload for memory and deploys. */
const DAILY_RELOAD_HOUR = 3;

type KioskPhase = "idle" | "connecting" | "live" | "resting";

export default function KioskPage() {
  const params = useParams();
  const widgetId = params.widgetId as Id<"widgets">;

  const config = useQuery(api.kiosk.getKioskConfig, { widgetId });
  const createKioskThread = useMutation(api.kiosk.createKioskThread);
  const createVoiceSession = useAction(api.kioskActions.createKioskVoiceSession);
  const recordVoiceTurn = useMutation(api.kiosk.recordKioskVoiceTurn);
  const heartbeat = useMutation(api.kiosk.recordKioskHeartbeat);

  const [phase, setPhase] = useState<KioskPhase>("idle");
  const [sessionState, setSessionState] = useState<VoiceSessionState>("idle");
  const [level, setLevel] = useState(0);
  const [userCaption, setUserCaption] = useState("");
  const [assistantCaption, setAssistantCaption] = useState("");
  const [stillThere, setStillThere] = useState(false);
  const [restingReason, setRestingReason] = useState<string | null>(null);

  const phaseRef = useRef<KioskPhase>("idle");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  const stateRef = useRef<VoiceSessionState>("idle");
  useEffect(() => {
    stateRef.current = sessionState;
  }, [sessionState]);

  const socketRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micNodeRef = useRef<ScriptProcessorNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const playheadRef = useRef(0);
  const playingSourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const pendingUserTextRef = useRef("");
  const assistantTextRef = useRef("");
  const modelRef = useRef<string | null>(null);
  // The visitor's session credentials, in memory only (decision 3): a page
  // refresh or reset leaves nothing for the next visitor to find.
  const sessionRef = useRef<{ threadId: Id<"threads">; accessToken: string } | null>(null);
  // Set at wake and on every server event; zero only before the first session.
  const lastActivityRef = useRef(0);

  /** The shape's one meter: visitor's voice while listening, reply while speaking. */
  useEffect(() => {
    let frame = 0;
    let tick = 0;
    const data = new Uint8Array(256);
    const read = (analyser: AnalyserNode | null) => {
      if (!analyser) return 0;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let index = 0; index < data.length; index += 1) {
        const centred = (data[index] - 128) / 128;
        sum += centred * centred;
      }
      return Math.min(1, Math.sqrt(sum / data.length) * 4);
    };
    const loop = () => {
      tick += 1;
      if (tick % 2 === 0) {
        const current = stateRef.current;
        setLevel(
          current === "speaking"
            ? read(playbackAnalyserRef.current)
            : current === "listening"
              ? read(micAnalyserRef.current)
              : 0
        );
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  const flushTurn = useCallback(() => {
    const session = sessionRef.current;
    const userText = pendingUserTextRef.current.trim();
    const assistantText = assistantTextRef.current.trim();
    pendingUserTextRef.current = "";
    assistantTextRef.current = "";
    if (!session || (!userText && !assistantText)) return;
    void recordVoiceTurn({
      threadId: session.threadId,
      widgetAccessToken: session.accessToken,
      userText,
      assistantText,
      ...(modelRef.current ? { modelUsed: modelRef.current } : {}),
    }).catch(() => {
      // Losing the written record must never interrupt the conversation.
    });
  }, [recordVoiceTurn]);

  const teardown = useCallback(() => {
    try {
      socketRef.current?.close();
    } catch {
      /* already gone */
    }
    socketRef.current = null;
    micNodeRef.current?.disconnect();
    micNodeRef.current = null;
    for (const source of playingSourcesRef.current) {
      try {
        source.stop();
      } catch {
        /* already ended */
      }
    }
    playingSourcesRef.current.clear();
    playheadRef.current = 0;
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    micAnalyserRef.current = null;
    playbackAnalyserRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
  }, []);

  /** Back to the invitation: captions cleared, credentials gone (decision 3). */
  const resetToIdle = useCallback(
    (reason?: string) => {
      flushTurn();
      teardown();
      sessionRef.current = null;
      setUserCaption("");
      setAssistantCaption("");
      setStillThere(false);
      setSessionState("idle");
      if (reason) {
        setRestingReason(reason);
        setPhase("resting");
      } else {
        setRestingReason(null);
        setPhase("idle");
      }
    },
    [flushTurn, teardown]
  );

  /** The wake tap: the one gesture that unlocks microphone and audio. */
  const wake = useCallback(async () => {
    if (phaseRef.current === "connecting" || phaseRef.current === "live") return;
    setPhase("connecting");
    setRestingReason(null);
    lastActivityRef.current = Date.now();

    try {
      const minted = await createKioskThread({ widgetId });
      if (!minted) {
        resetToIdle("This screen is not in service.");
        return;
      }
      sessionRef.current = minted;

      const voiceSession = await createVoiceSession({
        widgetId,
        threadId: minted.threadId,
        widgetAccessToken: minted.accessToken,
      });
      if (!voiceSession.ok) {
        resetToIdle(voiceSession.reason);
        return;
      }
      modelRef.current = voiceSession.model;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      micStreamRef.current = stream;

      const context = new AudioContext();
      audioContextRef.current = context;
      const micSource = context.createMediaStreamSource(stream);
      const micAnalyser = context.createAnalyser();
      micAnalyser.fftSize = 256;
      micSource.connect(micAnalyser);
      micAnalyserRef.current = micAnalyser;

      const playbackAnalyser = context.createAnalyser();
      playbackAnalyser.fftSize = 256;
      playbackAnalyser.connect(context.destination);
      playbackAnalyserRef.current = playbackAnalyser;

      const socket = new WebSocket(voiceSession.relayUrl);
      socket.binaryType = "arraybuffer";
      socketRef.current = socket;

      const stopPlayback = () => {
        for (const source of playingSourcesRef.current) {
          try {
            source.stop();
          } catch {
            /* already ended */
          }
        }
        playingSourcesRef.current.clear();
        playheadRef.current = 0;
      };

      socket.addEventListener("open", () => {
        socket.send(JSON.stringify({ ticket: voiceSession.ticket }));
        const processor = context.createScriptProcessor(4096, 1, 1);
        micNodeRef.current = processor;
        processor.onaudioprocess = (event) => {
          if (socket.readyState !== WebSocket.OPEN) return;
          const pcm = downsampleTo16k(event.inputBuffer.getChannelData(0), context.sampleRate);
          socket.send(pcm.buffer);
        };
        micSource.connect(processor);
        const sink = context.createGain();
        sink.gain.value = 0;
        processor.connect(sink);
        sink.connect(context.destination);
        setPhase("live");
        setSessionState("listening");
        lastActivityRef.current = Date.now();
      });

      socket.addEventListener("message", (message) => {
        const event = readLiveServerMessage(String(message.data));
        if (!event) return;
        lastActivityRef.current = Date.now();
        setStillThere(false);

        if (event.toolCalls?.length) {
          setSessionState("thinking");
          return;
        }
        if (event.interrupted) {
          stopPlayback();
          setSessionState("listening");
        }
        if (event.userTranscript) {
          pendingUserTextRef.current += event.userTranscript;
          setUserCaption(pendingUserTextRef.current);
        }
        if (event.assistantTranscript) {
          assistantTextRef.current += event.assistantTranscript;
          setAssistantCaption(assistantTextRef.current);
        }
        if (event.audioBase64) {
          const samples = decodePcm16Base64(event.audioBase64);
          if (samples.length > 0) {
            const buffer = context.createBuffer(1, samples.length, LIVE_OUTPUT_SAMPLE_RATE);
            buffer.copyToChannel(samples, 0);
            const source = context.createBufferSource();
            source.buffer = buffer;
            source.connect(playbackAnalyser);
            const startAt = Math.max(context.currentTime, playheadRef.current);
            source.start(startAt);
            playheadRef.current = startAt + buffer.duration;
            playingSourcesRef.current.add(source);
            source.onended = () => playingSourcesRef.current.delete(source);
            setSessionState("speaking");
          }
        }
        if (event.turnComplete) {
          flushTurn();
          setSessionState("listening");
        }
      });

      // A dropped connection is a rest, not an error (commitment 3): the
      // screen returns to its invitation and the next tap tries afresh.
      socket.addEventListener("close", () => {
        if (phaseRef.current === "live" || phaseRef.current === "connecting") {
          resetToIdle();
        }
      });
      socket.addEventListener("error", () => {
        if (phaseRef.current === "live" || phaseRef.current === "connecting") {
          resetToIdle("Back shortly.");
        }
      });
    } catch {
      // Microphone refused, network gone, quota reached — all the same to a
      // passer-by: a calm invitation to try again in a moment.
      resetToIdle("Back shortly.");
    }
  }, [createKioskThread, createVoiceSession, flushTurn, resetToIdle, widgetId]);

  /** Silence: nudge, then make way for the next visitor (decision 3). */
  useEffect(() => {
    if (phase !== "live") return;
    const timer = setInterval(() => {
      const quiet = Date.now() - lastActivityRef.current;
      if (quiet > RESET_AFTER_MS) {
        resetToIdle();
      } else if (quiet > STILL_THERE_AFTER_MS) {
        setStillThere(true);
      }
    }, 5_000);
    return () => clearInterval(timer);
  }, [phase, resetToIdle]);

  /** The heartbeat staff see as "last seen" on the admin widget screen. */
  useEffect(() => {
    if (!config) return;
    void heartbeat({ widgetId }).catch(() => {});
    const timer = setInterval(() => {
      void heartbeat({ widgetId }).catch(() => {});
    }, 60_000);
    return () => clearInterval(timer);
  }, [config, heartbeat, widgetId]);

  /** Overnight freshen-up: a kiosk left running for a week stays current. */
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      if (now.getHours() === DAILY_RELOAD_HOUR && phaseRef.current === "idle") {
        window.location.reload();
      }
    }, 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  // Loading, or a widget that has not opted in: nothing to show but calm.
  if (config === undefined) {
    return <div className="w-full h-screen bg-background" />;
  }
  if (config === null) {
    return (
      <div className="w-full h-screen bg-background flex items-center justify-center">
        <p className="text-[15px] text-muted">This screen is not in service.</p>
      </div>
    );
  }

  const accent = config.themePrimaryColor;

  return (
    <div
      className="w-full h-screen bg-background flex flex-col items-center justify-between overflow-hidden select-none"
      onClick={phase === "idle" || phase === "resting" ? () => void wake() : undefined}
    >
      {/* The permanent disclosure (commitment 2): never leaves the screen. */}
      <header className="pt-8 px-8 text-center">
        <h1 className="text-[17px] font-semibold text-foreground">
          You&apos;re talking to {config.companyName}&apos;s AI assistant
        </h1>
        <p className="mt-1 text-[12px] text-muted">
          Conversations are recorded so the team can follow up.
        </p>
      </header>

      <main className="flex-1 w-full flex flex-col items-center justify-center gap-8 px-8">
        <SpeakingCharacter
          state={phase === "live" ? sessionState : "idle"}
          level={phase === "live" ? level : 0}
          size={340}
        />

        {phase === "idle" && (
          <p className="text-[22px] font-medium text-foreground animate-pulse">Tap to talk</p>
        )}
        {phase === "resting" && (
          <p className="text-[17px] text-secondary">{restingReason ?? "Back shortly."}</p>
        )}
        {phase === "connecting" && <p className="text-[17px] text-secondary">One moment…</p>}

        {phase === "live" && (
          <div className="max-w-2xl w-full text-center flex flex-col gap-3 min-h-[7rem]">
            {userCaption && (
              <p className="text-[14px] text-muted leading-relaxed line-clamp-2">{userCaption}</p>
            )}
            {assistantCaption && (
              <p className="text-[17px] text-foreground leading-relaxed line-clamp-4">
                {assistantCaption}
              </p>
            )}
            {stillThere && <p className="text-[15px] text-secondary animate-pulse">Still there?</p>}
          </div>
        )}
      </main>

      <footer className="pb-8 px-8 flex flex-col items-center gap-3">
        {phase === "live" ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              resetToIdle();
            }}
            className="px-6 py-2.5 rounded-full border text-[14px] font-medium text-foreground transition-colors hover:bg-foreground/5"
            style={{ borderColor: `${accent}66` }}
          >
            End conversation
          </button>
        ) : (
          <span className="text-[11px] font-mono uppercase tracking-widest text-muted/60">
            Powered by Sonae
          </span>
        )}
      </footer>
    </div>
  );
}
