"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAction, useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import {
  createSpeechTurnDetector,
  cutSpeakableChunks,
  decodePcm16Base64,
  parsePcmSampleRate,
  type VoiceSessionState,
} from "@/src/lib/voiceSession";
import { LAYER } from "@/src/ui/lib/layers";
import { SpeakingCharacter } from "./SpeakingCharacter";

/**
 * The full-screen voice session: tap to talk, Sonae talks back, the shape
 * moves with the sound. Turn-based on purpose — no barge-in (see
 * docs/plans/active/voice-session-plan.md). Every turn is an ordinary
 * message row, so closing the overlay leaves the whole conversation in the
 * thread.
 *
 * Speech starts before the reply finishes: completed sentences are cut from
 * the streaming row, synthesized one call at a time, and scheduled
 * back-to-back on one AudioContext. A synthesis failure degrades the turn to
 * text with a quiet notice — a voice session must never eat an answer.
 */
const RECORDER_SLICE_MS = 250;
// Header slice plus ~1s of lead-in.
const PRE_SPEECH_SLICES = 5;

export function VoiceSessionOverlay({
  threadId,
  onClose,
}: {
  threadId: Id<"threads">;
  onClose: () => void;
}) {
  const t = useTranslations("ai.assistant.voice");
  const settings = useSystemSettings();
  const messages = useQuery(api.chat.getMessages, { threadId });
  // Spoken turns run on the fast model: a voice reply is heard a sentence at
  // a time, so time-to-first-word beats depth. Falls back to the thread's own
  // model when no fast default exists.
  const fastModels = useQuery(api.aiModels.getActiveModels, { useCase: "fast-chat" });
  const voiceModelId =
    fastModels?.find((model) => model.isDefault)?.modelId ?? fastModels?.[0]?.modelId;
  const sendMessage = useMutation(api.chat.sendMessage);
  const synthesizeSpeech = useAction(api.ai.synthesizeSpeech);
  const transcribeAudio = useAction(api.ai.transcribeAudio);

  const [sessionState, setSessionState] = useState<VoiceSessionState>("idle");
  // Resolved after mount so the portal target is never read during a server
  // render or a mid-refresh window where the document is not ready.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalTarget(document.body);
  }, []);
  const [level, setLevel] = useState(0);
  const [userCaption, setUserCaption] = useState("");
  const [assistantCaption, setAssistantCaption] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [micBlocked, setMicBlocked] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const playheadRef = useRef(0);
  const activeSourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const queueRef = useRef<string[]>([]);
  const processingRef = useRef(false);
  const consumedRef = useRef(0);
  const sentAtRef = useRef<number | null>(null);
  const streamCompleteRef = useRef(false);
  const voiceFailedRef = useRef(false);
  // Bumped whenever a turn is abandoned so stale async work drops itself.
  const turnRef = useRef(0);
  const stateRef = useRef(sessionState);
  stateRef.current = sessionState;
  // Natural turn taking: the detector hears when the speaker starts and
  // stops; the meter loop feeds it and commits the turn by itself.
  const speechDetectorRef = useRef<ReturnType<typeof createSpeechTurnDetector> | null>(null);
  const commitTurnRef = useRef<() => void>(() => {});
  const failedTurnsRef = useRef(0);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      analyser.connect(audioContextRef.current.destination);
      playbackAnalyserRef.current = analyser;
    }
    void audioContextRef.current.resume();
    return audioContextRef.current;
  }, []);

  // One meter loop for the whole session: reads whichever analyser matches
  // the state, ~30 updates a second — enough for the shape, cheap for React.
  useEffect(() => {
    let frame = 0;
    let tick = 0;
    const data = new Uint8Array(256);
    const loop = () => {
      tick += 1;
      if (tick % 2 === 0) {
        const analyser =
          stateRef.current === "listening"
            ? micAnalyserRef.current
            : stateRef.current === "speaking"
              ? playbackAnalyserRef.current
              : null;
        if (analyser) {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i += 1) {
            const centred = (data[i] - 128) / 128;
            sum += centred * centred;
          }
          // RMS scaled so ordinary speech lands mid-range.
          const rms = Math.min(1, Math.sqrt(sum / data.length) * 4);
          setLevel(rms);
          // While listening, the detector decides when the turn is over —
          // nobody taps anything mid-conversation.
          if (stateRef.current === "listening" && speechDetectorRef.current) {
            if (speechDetectorRef.current.update(rms, performance.now()) === "commit") {
              commitTurnRef.current();
            }
          }
        } else {
          setLevel(0);
        }
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  const stopPlayback = useCallback(() => {
    for (const source of activeSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // Already ended — stopping twice is harmless.
      }
    }
    activeSourcesRef.current.clear();
    queueRef.current = [];
    playheadRef.current = 0;
  }, []);

  const beginListening = useCallback(async () => {
    setNotice(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const context = getAudioContext();
      const micSource = context.createMediaStreamSource(stream);
      const micAnalyser = context.createAnalyser();
      micAnalyser.fftSize = 256;
      micSource.connect(micAnalyser);
      micAnalyserRef.current = micAnalyser;
      micStreamRef.current = stream;

      const preferred = ["audio/webm", "audio/mp4", "audio/ogg"].find(
        (type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(type)
      );
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      speechDetectorRef.current = createSpeechTurnDetector();

      // Recorded in slices so the silence before you speak can be thrown
      // away: transcription time scales with clip length, and sending a
      // minute of an empty room cost seconds per turn. The first slice is
      // kept whatever happens — it carries the container header, without
      // which the rest will not decode — and while nobody is speaking only
      // the last second of slices is retained, so the clip that gets sent is
      // your words plus a moment of lead-in.
      recorder.ondataavailable = (event) => {
        if (event.data.size === 0) return;
        chunksRef.current.push(event.data);
        if (!speechDetectorRef.current?.hasHeardSpeech() && chunksRef.current.length > PRE_SPEECH_SLICES) {
          const [header, ...rest] = chunksRef.current;
          chunksRef.current = [header, ...rest.slice(-PRE_SPEECH_SLICES + 1)];
        }
      };
      recorder.start(RECORDER_SLICE_MS);

      setSessionState("listening");
    } catch {
      setMicBlocked(true);
      setSessionState("idle");
    }
  }, [getAudioContext]);

  const releaseMic = useCallback(() => {
    speechDetectorRef.current = null;
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    micAnalyserRef.current = null;
  }, []);

  const maybeFinishTurn = useCallback(() => {
    if (
      streamCompleteRef.current &&
      !processingRef.current &&
      queueRef.current.length === 0 &&
      activeSourcesRef.current.size === 0
    ) {
      sentAtRef.current = null;
      // The loop continues by itself: Sonae finishes, the mic re-opens.
      void beginListening();
    }
  }, [beginListening]);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    const turn = turnRef.current;
    try {
      while (queueRef.current.length > 0) {
        const text = queueRef.current.shift();
        if (!text) continue;
        let audio: { audioBase64: string; mimeType: string };
        try {
          audio = await synthesizeSpeech({ text });
        } catch {
          // Degrade to text: the caption already shows the reply; say so
          // quietly and stop asking for sound this turn.
          voiceFailedRef.current = true;
          queueRef.current = [];
          setNotice(t("voiceUnavailable"));
          break;
        }
        if (turnRef.current !== turn) return; // turn abandoned mid-fetch
        const context = getAudioContext();
        const floats = decodePcm16Base64(audio.audioBase64);
        if (floats.length === 0) continue;
        const buffer = context.createBuffer(1, floats.length, parsePcmSampleRate(audio.mimeType));
        buffer.copyToChannel(floats, 0);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(playbackAnalyserRef.current ?? context.destination);
        const startAt = Math.max(context.currentTime, playheadRef.current);
        source.start(startAt);
        playheadRef.current = startAt + buffer.duration;
        activeSourcesRef.current.add(source);
        setSessionState("speaking");
        source.onended = () => {
          activeSourcesRef.current.delete(source);
          maybeFinishTurn();
        };
      }
    } finally {
      processingRef.current = false;
      maybeFinishTurn();
    }
  }, [getAudioContext, maybeFinishTurn, synthesizeSpeech, t]);

  const finishListeningAndSend = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || stateRef.current !== "listening") return;
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      releaseMic();
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64 = String(reader.result ?? "");
        const audioBase64 = base64.substring(base64.indexOf(",") + 1);
        // A missed turn resumes listening by itself — a conversation should
        // not fall back to a button — but three misses in a row stop the
        // loop rather than burning the rate limit against a broken setup.
        const missTurn = () => {
          failedTurnsRef.current += 1;
          setNotice(t("didntCatch"));
          if (failedTurnsRef.current >= 3) {
            setSessionState("idle");
          } else {
            void beginListening();
          }
        };
        try {
          const mimeType = (recorder.mimeType || "audio/webm").split(";")[0];
          const transcribeResult = await transcribeAudio({ audioBase64, mimeType });
          const text = transcribeResult.trim();
          if (!text) {
            missTurn();
            return;
          }
          failedTurnsRef.current = 0;
          setUserCaption(text);
          setAssistantCaption("");
          consumedRef.current = 0;
          streamCompleteRef.current = false;
          voiceFailedRef.current = false;
          turnRef.current += 1;
          sentAtRef.current = Date.now();
          setSessionState("thinking");
          await sendMessage({
            threadId,
            content: text,
            ...(voiceModelId ? { modelId: voiceModelId } : {}),
            thinkingLevel: "NONE",
          });
        } catch {
          missTurn();
        }
      };
    };
    recorder.stop();
    setSessionState("thinking");
  }, [beginListening, releaseMic, sendMessage, t, threadId, transcribeAudio, voiceModelId]);

  // The detector commits turns from inside the meter loop; keep its target
  // pointing at the freshest callback.
  useEffect(() => {
    commitTurnRef.current = finishListeningAndSend;
  }, [finishListeningAndSend]);

  // Watch the thread for the reply to the turn we just sent, and cut every
  // newly completed sentence into the speaking queue as it arrives.
  useEffect(() => {
    if (!messages || sentAtRef.current === null || voiceFailedRef.current) return;
    const reply = [...messages]
      .reverse()
      .find((message) => message.role === "assistant" && message.createdAt > (sentAtRef.current ?? 0));
    if (!reply) return;
    setAssistantCaption(reply.content);
    const isComplete = reply.isStreaming !== true;
    const cut = cutSpeakableChunks({
      content: reply.content,
      consumedLength: consumedRef.current,
      isComplete,
    });
    consumedRef.current = cut.consumedLength;
    if (isComplete) streamCompleteRef.current = true;
    if (cut.chunks.length > 0) {
      queueRef.current.push(...cut.chunks);
      void processQueue();
    } else if (isComplete) {
      maybeFinishTurn();
    }
  }, [messages, maybeFinishTurn, processQueue]);

  const abandonSpeaking = useCallback(() => {
    turnRef.current += 1;
    streamCompleteRef.current = true;
    stopPlayback();
    void beginListening();
  }, [beginListening, stopPlayback]);

  const closeSession = useCallback(() => {
    turnRef.current += 1;
    stopPlayback();
    releaseMic();
    recorderRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    onClose();
  }, [onClose, releaseMic, stopPlayback]);

  // Close cleanly if the component unmounts underneath the session.
  useEffect(
    () => () => {
      stopPlayback();
      releaseMic();
      void audioContextRef.current?.close();
    },
    [releaseMic, stopPlayback]
  );

  const primaryAction =
    sessionState === "idle"
      ? {
          label: t("start"),
          onClick: () => {
            failedTurnsRef.current = 0;
            void beginListening();
          },
        }
      : sessionState === "listening"
        ? // Hands-free: the pill is a status line; tapping it commits the
          // turn early for anyone who does not want to wait out the pause.
          { label: t("listening"), onClick: finishListeningAndSend }
        : sessionState === "speaking"
          ? { label: t("speaking"), onClick: abandonSpeaking }
          : { label: t("thinking"), onClick: undefined };

  // A portal to the body: the dashboard shell transforms its workspace, which
  // turns `fixed` into "fixed inside the shell" and slides this overlay's top
  // bar underneath the app header. The session owns the whole screen.
  if (!portalTarget) return null;
  return createPortal(
    <div className={`fixed inset-0 ${LAYER.OVERLAY} flex flex-col items-center justify-between bg-background p-6`}>
      <div className="flex w-full items-start justify-between">
        <p className="text-sm text-secondary">{t("disclosure", { platformName: settings.platformName })}</p>
        <button
          type="button"
          onClick={closeSession}
          className="rounded-md border border-border-dim px-3 py-1.5 text-sm text-secondary hover:bg-hover"
        >
          {t("close")}
        </button>
      </div>

      <div className="flex flex-col items-center gap-6">
        <SpeakingCharacter state={sessionState} level={level} />
        <button
          type="button"
          onClick={primaryAction.onClick}
          disabled={!primaryAction.onClick}
          className="rounded-full border border-border-dim px-6 py-3 text-base text-foreground hover:bg-hover disabled:opacity-60"
        >
          {primaryAction.label}
        </button>
        {notice ? <p className="text-sm text-warning">{notice}</p> : null}
        {micBlocked ? <p className="text-sm text-destructive">{t("micBlocked")}</p> : null}
      </div>

      <div className="w-full max-w-2xl space-y-2 pb-4 text-center" aria-live="polite">
        {userCaption ? <p className="text-sm text-secondary">{userCaption}</p> : null}
        {assistantCaption ? <p className="text-base text-foreground">{assistantCaption}</p> : null}
      </div>
    </div>,
    portalTarget
  );
}
