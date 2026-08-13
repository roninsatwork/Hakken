"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAction, useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import type { VoiceSessionState } from "@/src/lib/voiceSession";
import { LAYER } from "@/src/ui/lib/layers";
import { SpeakingCharacter } from "./SpeakingCharacter";

/**
 * Real-time voice.
 *
 * The browser opens one live audio connection to a speech-to-speech model and
 * keeps it open: your microphone streams up continuously, the reply streams
 * back as audio, and the model decides for itself when you have finished
 * speaking. Nothing is recorded, uploaded, transcribed and re-synthesized in
 * a queue, which is why this answers in well under a second where the
 * turn-based session took five or more, and why you can cut it off
 * mid-sentence simply by talking.
 *
 * WebRTC rather than a raw socket because the browser then owns the hard
 * parts: echo cancellation (so it does not hear itself), jitter buffering,
 * and packet loss. The platform's API key never comes near the page — the
 * server mints a one-minute pass that can only open this session.
 */
export function RealtimeVoiceOverlay({
  threadId,
  onClose,
}: {
  threadId: Id<"threads">;
  onClose: () => void;
}) {
  const t = useTranslations("ai.assistant.voice");
  const settings = useSystemSettings();
  const createSession = useAction(api.ai.createRealtimeVoiceSession);
  const recordVoiceTurn = useMutation(api.chat.recordVoiceTurn);

  const [sessionState, setSessionState] = useState<VoiceSessionState>("idle");
  const [connecting, setConnecting] = useState(false);
  const [level, setLevel] = useState(0);
  const [userCaption, setUserCaption] = useState("");
  const [assistantCaption, setAssistantCaption] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => setPortalTarget(document.body), []);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const remoteAnalyserRef = useRef<AnalyserNode | null>(null);
  const stateRef = useRef(sessionState);
  stateRef.current = sessionState;
  // The pair currently being spoken, written to the thread once both halves
  // have arrived so the transcript reads as a conversation.
  const pendingUserTextRef = useRef("");
  const assistantTextRef = useRef("");
  const modelRef = useRef<string | null>(null);

  // One meter for the whole session: the caller's voice while they speak, the
  // reply while it plays. Sampled at half frame rate — plenty for the shape.
  useEffect(() => {
    let frame = 0;
    let tick = 0;
    const data = new Uint8Array(256);
    const read = (analyser: AnalyserNode | null) => {
      if (!analyser) return 0;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const centred = (data[i] - 128) / 128;
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
            ? read(remoteAnalyserRef.current)
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
    const userText = pendingUserTextRef.current.trim();
    const assistantText = assistantTextRef.current.trim();
    pendingUserTextRef.current = "";
    assistantTextRef.current = "";
    if (!userText && !assistantText) return;
    void recordVoiceTurn({
      threadId,
      userText,
      assistantText,
      ...(modelRef.current ? { modelUsed: modelRef.current } : {}),
    }).catch(() => {
      // Losing the written record must never interrupt the conversation.
    });
  }, [recordVoiceTurn, threadId]);

  const teardown = useCallback(() => {
    peerRef.current?.getSenders().forEach((sender) => sender.track?.stop());
    peerRef.current?.close();
    peerRef.current = null;
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    micAnalyserRef.current = null;
    remoteAnalyserRef.current = null;
    audioElementRef.current?.pause();
    audioElementRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
  }, []);

  const handleServerEvent = useCallback(
    (event: { type?: string; transcript?: string; delta?: string }) => {
      switch (event.type) {
        // The model heard speech start — it handles turn taking itself, so
        // these events drive the display rather than any decision.
        case "input_audio_buffer.speech_started":
          setSessionState("listening");
          setNotice(null);
          break;
        case "input_audio_buffer.speech_stopped":
          setSessionState("thinking");
          break;
        case "conversation.item.input_audio_transcription.completed":
          if (event.transcript) {
            pendingUserTextRef.current = event.transcript;
            setUserCaption(event.transcript);
            setAssistantCaption("");
          }
          break;
        // Naming differs between realtime revisions; both are handled so a
        // model upgrade cannot silently empty the captions.
        case "response.output_audio_transcript.delta":
        case "response.audio_transcript.delta":
          if (event.delta) {
            assistantTextRef.current += event.delta;
            setAssistantCaption(assistantTextRef.current);
            setSessionState("speaking");
          }
          break;
        case "response.output_audio_transcript.done":
        case "response.audio_transcript.done":
          if (event.transcript) {
            assistantTextRef.current = event.transcript;
            setAssistantCaption(event.transcript);
          }
          break;
        case "response.done":
          flushTurn();
          setSessionState("listening");
          break;
        case "error":
          setNotice(t("connectionLost"));
          break;
        default:
          break;
      }
    },
    [flushTurn, t]
  );

  const start = useCallback(async () => {
    if (connecting || peerRef.current) return;
    setConnecting(true);
    setNotice(null);
    try {
      const session = await createSession({ threadId });
      modelRef.current = session.model;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      micStreamRef.current = stream;

      const peer = new RTCPeerConnection();
      peerRef.current = peer;

      const context = new AudioContext();
      audioContextRef.current = context;
      const micAnalyser = context.createAnalyser();
      micAnalyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(micAnalyser);
      micAnalyserRef.current = micAnalyser;

      // The reply plays through an audio element (WebRTC's own path, so echo
      // cancellation works), and is tapped separately to move the shape.
      const audio = new Audio();
      audio.autoplay = true;
      audioElementRef.current = audio;
      peer.ontrack = (event) => {
        audio.srcObject = event.streams[0];
        const remoteAnalyser = context.createAnalyser();
        remoteAnalyser.fftSize = 256;
        context.createMediaStreamSource(event.streams[0]).connect(remoteAnalyser);
        remoteAnalyserRef.current = remoteAnalyser;
      };

      stream.getTracks().forEach((track) => peer.addTrack(track, stream));

      const channel = peer.createDataChannel("oai-events");
      channel.addEventListener("message", (message) => {
        try {
          handleServerEvent(JSON.parse(message.data));
        } catch {
          // A message we cannot read is not a reason to drop the call.
        }
      });

      peer.addEventListener("connectionstatechange", () => {
        if (peer.connectionState === "failed" || peer.connectionState === "disconnected") {
          setNotice(t("connectionLost"));
          setSessionState("idle");
        }
      });

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      const answer = await fetch(
        `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(session.model)}`,
        {
          method: "POST",
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${session.clientSecret}`,
            "Content-Type": "application/sdp",
          },
        }
      );
      if (!answer.ok) throw new Error("realtime handshake failed");

      await peer.setRemoteDescription({ type: "answer", sdp: await answer.text() });
      setSessionState("listening");
    } catch (error) {
      const blocked = error instanceof DOMException && error.name === "NotAllowedError";
      setNotice(blocked ? t("micBlocked") : t("connectionLost"));
      teardown();
      setSessionState("idle");
    } finally {
      setConnecting(false);
    }
  }, [connecting, createSession, handleServerEvent, t, teardown, threadId]);

  const close = useCallback(() => {
    flushTurn();
    teardown();
    onClose();
  }, [flushTurn, onClose, teardown]);

  useEffect(() => () => teardown(), [teardown]);

  const statusLabel = connecting
    ? t("connecting")
    : sessionState === "idle"
      ? t("start")
      : sessionState === "listening"
        ? t("liveListening")
        : sessionState === "thinking"
          ? t("thinking")
          : t("liveSpeaking");

  if (!portalTarget) return null;
  return createPortal(
    <div className={`fixed inset-0 ${LAYER.OVERLAY} flex flex-col items-center justify-between bg-background p-6`}>
      <div className="flex w-full items-start justify-between">
        <p className="text-sm text-secondary">
          {t("disclosure", { platformName: settings.platformName })}
        </p>
        <button
          type="button"
          onClick={close}
          className="rounded-md border border-border-dim px-3 py-1.5 text-sm text-secondary hover:bg-hover"
        >
          {t("close")}
        </button>
      </div>

      <div className="flex flex-col items-center gap-8">
        <SpeakingCharacter state={sessionState} level={level} />
        {sessionState === "idle" ? (
          <button
            type="button"
            onClick={() => void start()}
            disabled={connecting}
            className="rounded-full border border-border-dim px-7 py-3 text-base text-foreground transition-colors hover:bg-hover disabled:opacity-60"
          >
            {statusLabel}
          </button>
        ) : (
          <p className="text-sm tracking-wide text-secondary">{statusLabel}</p>
        )}
        {notice ? <p className="text-sm text-warning">{notice}</p> : null}
      </div>

      <div className="w-full max-w-2xl space-y-2 pb-4 text-center" aria-live="polite">
        {userCaption ? <p className="text-sm text-secondary">{userCaption}</p> : null}
        {assistantCaption ? <p className="text-base text-foreground">{assistantCaption}</p> : null}
      </div>
    </div>,
    portalTarget
  );
}
