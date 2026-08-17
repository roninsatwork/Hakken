"use client";

import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { AudioLines, Check, Loader2, Play, Square } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { SaveError, SaveFeedback } from "@/src/ui/components/screens/SaveControls";
import {
  TableHeaderCell,
  TableHeaderRow,
  TableLoadingRow,
  TableShell,
} from "@/src/ui/components/screens/Table";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { getErrorMessage } from "@/src/lib/errors";
import { LIVE_OUTPUT_SAMPLE_RATE, readLiveServerMessage } from "@/src/lib/googleLiveVoice";
import { decodePcm16Base64 } from "@/src/lib/voiceSession";
import { AiWorkspaceNav } from "../_components/AiWorkspaceNav";
import { cn } from "@/src/ui/lib/utils";

/**
 * One voice for everywhere Sonae speaks.
 *
 * Ask Sonae's voice overlay, the phone line and the reception screen all
 * read the same workspace setting, so the choice made here is the voice at
 * every door at once. Each row can be heard before it is chosen — the
 * preview is the production loop itself (the real relay, the real model,
 * the real voice) held to a one-line introduction, because previewing a
 * voice through some other speech API would demo a voice the product never
 * uses.
 */
export default function SpokenVoicePage() {
  const t = useTranslations("aiVoice");
  const setting = useQuery(api.voiceSettings.getSpokenVoice, {});
  const setSpokenVoice = useMutation(api.voiceSettings.setSpokenVoice);
  const mintPreview = useAction(api.voicePreview.mintVoicePreviewTicket);

  const [savingVoice, setSavingVoice] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  // The row being auditioned: connecting while the relay dials, playing once
  // audio is scheduled. One preview at a time — two voices talking over each
  // other demonstrates neither.
  const [previewVoice, setPreviewVoice] = useState<string | null>(null);
  const [previewPhase, setPreviewPhase] = useState<"connecting" | "playing">("connecting");
  const previewCleanupRef = useRef<() => void>(() => {});

  useEffect(() => () => previewCleanupRef.current(), []);

  const chooseVoice = async (voice: string) => {
    if (savingVoice) return;
    setSavingVoice(voice);
    setErrorMessage("");
    setSaveStatus("idle");
    try {
      await setSpokenVoice({ voice });
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3500);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error, t("errors.save")));
    } finally {
      setSavingVoice(null);
    }
  };

  const stopPreview = () => previewCleanupRef.current();

  const playPreview = async (voice: string) => {
    previewCleanupRef.current();
    setErrorMessage("");
    setPreviewVoice(voice);
    setPreviewPhase("connecting");
    try {
      const session = await mintPreview({ voice });
      const context = new AudioContext();
      const socket = new WebSocket(session.relayUrl);
      const playingSources = new Set<AudioBufferSourceNode>();
      let playhead = 0;
      let finished = false;

      const cleanup = () => {
        if (finished) return;
        finished = true;
        for (const source of playingSources) {
          try {
            source.stop();
          } catch {
            /* already ended */
          }
        }
        try {
          socket.close();
        } catch {
          /* already closed */
        }
        void context.close().catch(() => {});
        setPreviewVoice((current) => (current === voice ? null : current));
      };
      previewCleanupRef.current = cleanup;

      socket.addEventListener("open", () => {
        socket.send(JSON.stringify({ ticket: session.ticket }));
        // The relay holds frames until the model's line is open, so the
        // request to speak can follow the ticket immediately.
        socket.send(
          JSON.stringify({
            clientContent: {
              turns: [{ role: "user", parts: [{ text: "Introduce yourself." }] }],
              turnComplete: true,
            },
          })
        );
      });

      socket.addEventListener("message", (message) => {
        const event = readLiveServerMessage(String(message.data));
        if (!event) return;
        if (event.audioBase64) {
          const samples = decodePcm16Base64(event.audioBase64);
          if (samples.length > 0) {
            const buffer = context.createBuffer(1, samples.length, LIVE_OUTPUT_SAMPLE_RATE);
            buffer.copyToChannel(samples, 0);
            const source = context.createBufferSource();
            source.buffer = buffer;
            source.connect(context.destination);
            const startAt = Math.max(context.currentTime, playhead);
            source.start(startAt);
            playhead = startAt + buffer.duration;
            playingSources.add(source);
            source.onended = () => playingSources.delete(source);
            setPreviewPhase("playing");
          }
        }
        if (event.turnComplete) {
          // Let what is already scheduled finish before hanging up.
          const remainingMs = Math.max(0, (playhead - context.currentTime) * 1000) + 300;
          setTimeout(cleanup, remainingMs);
        }
      });

      socket.addEventListener("close", () => {
        // A drop before any audio arrived is a failed preview, not a finish —
        // and it must say so, never leave the button silently resetting.
        if (!finished && playhead === 0) {
          setErrorMessage(t("errors.preview"));
          cleanup();
        }
      });
      socket.addEventListener("error", () => {
        setErrorMessage(t("errors.preview"));
        cleanup();
      });
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error, t("errors.preview")));
      setPreviewVoice((current) => (current === voice ? null : current));
    }
  };

  const isLoading = setting === undefined;

  return (
    <div className="flex flex-col gap-6 pb-12 w-full">
      <PageHeader
        icon={<AudioLines className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
        divider
      />

      <AiWorkspaceNav />

      <SaveFeedback
        status={saveStatus}
        successTitle={t("success.title")}
        successMessage={t("success.message")}
        errorTitle={t("errors.saveTitle")}
        errorMessage=""
      />
      <SaveError>{errorMessage}</SaveError>

      <p className="text-[13px] leading-relaxed text-secondary max-w-2xl">{t("hint")}</p>

      <TableShell minWidthClassName="min-w-[640px]">
        <thead>
          <TableHeaderRow>
            <TableHeaderCell>{t("columns.voice")}</TableHeaderCell>
            <TableHeaderCell>{t("columns.sound")}</TableHeaderCell>
            <TableHeaderCell align="right">{t("columns.actions")}</TableHeaderCell>
          </TableHeaderRow>
        </thead>
        <tbody>
          {isLoading ? (
            <TableLoadingRow colSpan={3} />
          ) : (
            setting.options.map((option) => {
              const isCurrent = option.key === setting.voice;
              const isPreviewing = previewVoice === option.key;
              return (
                <tr
                  key={option.key}
                  className="group border-b border-border-dim/40 last:border-b-0 hover:bg-hover/40 transition-colors"
                >
                  <td className="px-4 py-4">
                    <span className="flex items-center gap-2 text-[14px] font-medium text-foreground">
                      {option.key}
                      {isCurrent && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand/10 text-brand text-[11px] font-medium">
                          <Check className="w-3 h-3" />
                          {t("current")}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-[13px] text-secondary">
                    {t(`voices.${option.key}`)}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => (isPreviewing ? stopPreview() : playPreview(option.key))}
                        disabled={previewVoice !== null && !isPreviewing}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-[10px] border text-[12px] font-medium transition-colors disabled:opacity-40",
                          isPreviewing
                            ? "border-brand/60 text-brand bg-brand/5"
                            : "border-border-dim text-secondary hover:bg-hover"
                        )}
                      >
                        {isPreviewing ? (
                          previewPhase === "connecting" ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Square className="w-3.5 h-3.5" />
                          )
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                        <span>{isPreviewing ? t("stop") : t("listen")}</span>
                      </button>
                      {!isCurrent && (
                        <WriteButton
                          onClick={() => chooseVoice(option.key)}
                          disabled={savingVoice !== null}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-[12px] bg-foreground text-background font-medium hover:opacity-90 transition-all disabled:opacity-50"
                        >
                          {savingVoice === option.key ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : null}
                          <span>{t("use")}</span>
                        </WriteButton>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </TableShell>
    </div>
  );
}
