"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAction, useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import type { VoiceSessionState } from "@/src/lib/voiceSession";
import { decodePcm16Base64 } from "@/src/lib/voiceSession";
import {
  downsampleTo16k,
  LIVE_OUTPUT_SAMPLE_RATE,
  readLiveServerMessage,
} from "@/src/lib/googleLiveVoice";
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
  const searchKnowledge = useAction(api.ai.searchKnowledgeForVoice);

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
  // The data channel, kept so the answer to a knowledge lookup can be sent
  // back into the conversation the model is already having.
  const channelRef = useRef<RTCDataChannel | null>(null);
  // Google path only: the relay socket, the microphone worklet feeding it,
  // and the playhead that keeps returned audio contiguous.
  const relaySocketRef = useRef<WebSocket | null>(null);
  const micNodeRef = useRef<ScriptProcessorNode | null>(null);
  const playheadRef = useRef(0);
  const playingSourcesRef = useRef(new Set<AudioBufferSourceNode>());

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
    try {
      relaySocketRef.current?.close();
    } catch {
      /* already gone */
    }
    relaySocketRef.current = null;
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
        // The model asked to look something up. Nothing is spoken while this
        // runs, so it has to be quick — the search is deliberately small.
        case "response.function_call_arguments.done": {
          const call = event as { name?: string; call_id?: string; arguments?: string };
          if (!call.call_id) break;
          let query = "";
          try {
            query = String(JSON.parse(call.arguments ?? "{}").query ?? "");
          } catch {
            query = "";
          }
          setSessionState("thinking");
          void searchKnowledge({ threadId, query })
            .then((result) => {
              const channel = channelRef.current;
              if (!channel || channel.readyState !== "open") return;
              channel.send(
                JSON.stringify({
                  type: "conversation.item.create",
                  item: {
                    type: "function_call_output",
                    call_id: call.call_id,
                    output:
                      result.context ||
                      "Nothing in the company's knowledge covers that. Say so plainly.",
                  },
                })
              );
              channel.send(JSON.stringify({ type: "response.create" }));
            })
            .catch(() => {
              const channel = channelRef.current;
              if (channel?.readyState === "open") {
                channel.send(
                  JSON.stringify({
                    type: "conversation.item.create",
                    item: {
                      type: "function_call_output",
                      call_id: call.call_id,
                      output: "The knowledge search failed. Say you could not check just now.",
                    },
                  })
                );
                channel.send(JSON.stringify({ type: "response.create" }));
              }
            });
          break;
        }
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
    [flushTurn, searchKnowledge, t, threadId]
  );


  /**
   * Google's live voice, through the platform's relay.
   *
   * Vertex speaks a raw socket, so the browser does the audio work: the
   * microphone is downsampled and streamed up continuously, and the audio
   * that returns is queued nose-to-tail on one clock so it plays as a voice
   * rather than a stutter. Talking over it stops playback immediately —
   * Vertex says when it has been interrupted.
   */
  const startGoogleRelay = useCallback(
    async (session: { relayUrl: string; ticket: string; model: string }) => {
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
      remoteAnalyserRef.current = playbackAnalyser;

      const socket = new WebSocket(session.relayUrl);
      socket.binaryType = "arraybuffer";
      relaySocketRef.current = socket;

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
        socket.send(JSON.stringify({ ticket: session.ticket }));

        // 4096 frames is about 85ms at 48kHz — small enough to feel live,
        // large enough not to flood the socket.
        const processor = context.createScriptProcessor(4096, 1, 1);
        micNodeRef.current = processor;
        processor.onaudioprocess = (event) => {
          if (socket.readyState !== WebSocket.OPEN) return;
          const pcm = downsampleTo16k(event.inputBuffer.getChannelData(0), context.sampleRate);
          socket.send(pcm.buffer);
        };
        micSource.connect(processor);
        // Silent sink: some browsers will not run a processor that is not
        // connected to anything downstream.
        const sink = context.createGain();
        sink.gain.value = 0;
        processor.connect(sink);
        sink.connect(context.destination);
        setSessionState("listening");
      });

      socket.addEventListener("message", (message) => {
        const event = readLiveServerMessage(String(message.data));
        if (!event) return;

        // The model has stopped mid-sentence to look something up. The relay
        // answers it — a phone call has no browser to do that in, and one
        // place doing the searching is what stops a spoken surface quietly
        // knowing less than the typed one. All this screen does is show that
        // it is happening.
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

      socket.addEventListener("close", () => {
        setNotice(t("connectionLost"));
        setSessionState("idle");
      });
      socket.addEventListener("error", () => {
        setNotice(t("connectionLost"));
        setSessionState("idle");
      });
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

      if (session.transport === "google-relay") {
        await startGoogleRelay(session);
        return;
      }

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
      channelRef.current = channel;
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
  }, [connecting, createSession, handleServerEvent, startGoogleRelay, t, teardown, threadId]);

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
