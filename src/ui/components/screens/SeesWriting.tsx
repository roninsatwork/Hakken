"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SeesStageRow } from "@/convex/utils/sees/stages";
import { cn } from "@/src/ui/lib/utils";
import type { HakkenSeesStep } from "./HakkenSees";
import { StatusLabel } from "./StatusLabel";

/**
 * "What it means" while it is written and as it comes in (Anthony, 2026-11-04: "this text is static … Can we get it to
 * show what the AI is doing. Then the response text is just one lump without any formatting … make it format better and
 * also not come in at once, make it work like a teleprompter").
 *
 * The words only reach the panel once the Editor has passed them, so what comes in here is always the checked words,
 * shown at reading pace: never a model's first draft, which may yet be sent back.
 */

/** One word every this long: about 16 words a second, so six sentences take seven or eight seconds. */
const WORD_MS = 60;
/** Words' worth of time between one sentence and the next: the beat a teleprompter leaves at a full stop. */
const PAUSE_WORDS = 3;

/** A figure in the words: 1,258 or 7.5% or £40, never the 4 of "GA4" or the 2 of "2nd". */
const FIGURE = /(?<![\p{L}\d])[£$€]?\d+(?:[.,]\d+)*%?(?![\p{L}\d])/gu;

/** Whether the words may move: never on a computer set to reduce motion, nor where nothing can say (a drawing's). */
function maySlide(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The press's stages, as it goes (`utils/sees/stages.ts`): what is done, ticked, then what it is doing now, turning. */
export function SeesProgress({ stages }: { stages: readonly SeesStageRow[] }) {
  const t = useTranslations("ui.hakkenSees");
  const n = (chunks: ReactNode) => <span className="font-mono">{chunks}</span>;
  // The press is saved with its first stage: this stands in for the moment before its answer reaches the page.
  const shown: readonly SeesStageRow[] = stages.length > 0 ? stages : [{ stage: "reading" }];
  const words = (row: SeesStageRow, now: boolean) => {
    const group = now ? "working" : "worked";
    if (row.stage === "reading" && row.count !== undefined) return t.rich(`${group}.readingCount`, { n, count: row.count });
    if (now) return t(`working.${row.stage}`);
    if (row.stage === "finding" || row.stage === "screens") return t.rich(`worked.${row.stage}`, { n, count: row.count ?? 0 });
    return t(`worked.${row.stage}`);
  };
  return (
    <ol data-part="sees-working" className="flex flex-col gap-2">
      {shown.map((row, at) => {
        const now = at === shown.length - 1;
        return (
          <li key={`${at}-${row.stage}`} data-part={now ? "sees-working-now" : "sees-working-done"}>
            {now
              ? <StatusLabel tone="warning" icon="working" size="md" wrap>{words(row, true)}</StatusLabel>
              : <StatusLabel tone="success" size="md" wrap><span className="text-secondary">{words(row, false)}</span></StatusLabel>}
          </li>
        );
      })}
    </ol>
  );
}

/** One word with any figure in it in the numbers' font, so the figures stand out of the sentence at a glance. */
function withFigures(word: string): ReactNode {
  const parts: ReactNode[] = [];
  let from = 0;
  for (const match of word.matchAll(FIGURE)) {
    if (match.index > from) parts.push(word.slice(from, match.index));
    parts.push(<span key={match.index} className="font-mono text-foreground">{match[0]}</span>);
    from = match.index + match[0].length;
  }
  if (from === 0) return word;
  if (from < word.length) parts.push(word.slice(from));
  return parts;
}

/**
 * The words: each sentence on its own line, the first brighter as it leads, figures in the numbers' font, then "Do first"
 * and the steps, each with its quiet link. `reveal` brings them in like a teleprompter: a word at a time at reading pace,
 * the line being read lit, the panel following it down until the reader scrolls for themselves. Every sentence holds its
 * place from the start, so nothing jumps as it fills, and a screen reader has them all at once. Give it a `key` of its
 * words: new words start again.
 */
export function SeesWords({ says, steps, reveal = false, onRevealed }: { says: string[]; steps: HakkenSeesStep[]; reveal?: boolean; onRevealed?: () => void }) {
  const t = useTranslations("ui.hakkenSees");
  const sentences = useMemo(() => says.map((sentence) => sentence.split(/\s+/).filter(Boolean)), [says]);
  // The tick each sentence starts on, its words following one a tick, then a pause before the next.
  const starts = useMemo(() => sentences.reduce<number[]>((all, _, at) => [...all, at === 0 ? 0 : all[at - 1] + sentences[at - 1].length + PAUSE_WORDS], []), [sentences]);
  const lastTick = sentences.length > 0 ? starts[starts.length - 1] + sentences[sentences.length - 1].length : 0;
  const [tick, setTick] = useState(() => (reveal && maySlide() ? 0 : Number.POSITIVE_INFINITY));
  const running = tick < lastTick;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTick((now) => now + 1), WORD_MS);
    return () => clearInterval(timer);
  }, [running]);
  // Finished, or never to run: the panel keeps this from running again for the same words.
  const told = useRef(false);
  useEffect(() => {
    if (running || told.current) return;
    told.current = true;
    onRevealed?.();
  }, [running, onRevealed]);
  // The line being read: the last to have started. None once it has all come in.
  const reading = running ? starts.reduce((line, start, at) => (tick >= start ? at : line), 0) : -1;
  const following = useRef(true);
  useEffect(() => {
    if (!running) return;
    const stop = () => { following.current = false; };
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchmove", stop, { passive: true });
    return () => {
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
    };
  }, [running]);
  const lines = useRef<HTMLDivElement>(null);
  const stepsBlock = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (reading >= 0) moved.current = true;
    if (!moved.current || !following.current) return;
    const target = reading >= 0 ? lines.current?.children[reading] : stepsBlock.current;
    target?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [reading]);
  return (
    <>
      {/* A page with nothing to say by its rule yet still has the chat below (sees-every-page-plan-2026-10-31.md). */}
      {says.length === 0 ? <p className="text-[13px] leading-[1.6] text-secondary">{t("askBelow")}</p> : null}
      {says.length > 0 ? (
        <div ref={lines} data-part="sees-sentences" className="flex flex-col gap-2.5">
          {sentences.map((sentence, line) => (
            <p
              key={line}
              data-part="sees-sentence"
              className={cn(
                "text-[13px] leading-[1.6] transition-[color,transform] duration-500 ease-out motion-reduce:transition-none",
                (reading >= 0 ? line === reading : line === 0) ? "text-foreground" : "text-secondary",
                tick < starts[line] && "translate-y-1.5",
              )}
            >
              {sentence.map((word, at) => (
                <span key={at} className={cn("transition-opacity duration-300 ease-out motion-reduce:transition-none", tick < starts[line] + at && "opacity-0")}>
                  {withFigures(word)}{at < sentence.length - 1 ? " " : ""}
                </span>
              ))}
            </p>
          ))}
        </div>
      ) : null}
      {steps.length > 0 ? (
        <div ref={stepsBlock} data-part="sees-steps" className={cn("mt-1 flex flex-col gap-2 transition-opacity duration-500 ease-out motion-reduce:transition-none", running && "invisible opacity-0")}>
          <div className="text-[12px] text-muted">{t("doFirst")}</div>
          {steps.map((step, at) => (
            <div key={`${at}-${step.href}`} className="flex flex-wrap items-center gap-3">
              <span className="text-[13px] text-foreground">{at + 1}. {step.words}</span>
              <Link
                href={step.href}
                {...(step.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="inline-flex items-center gap-1.5 text-[12px] text-secondary hover:text-foreground"
              >
                {step.link}
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
