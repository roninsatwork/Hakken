"use client";

import { useTranslations } from "next-intl";
import { HakkenMarkdown } from "@/src/ui/components/chat/HakkenMarkdown";
import { ExternalUrlCell } from "../../sites/_components/SiteCells";
import { readableAddress, withoutTracking } from "./researchWords";

/** The answer's markdown with each address it links cleaned of its tracking. */
function cleanAnswer(text: string): string {
  return text.replace(/\]\((https?:\/\/[^)\s]+)\)/g, (_, url: string) => `](${withoutTracking(url)})`);
}

/**
 * One assistant's answer, opened under its row on What the AI says (Anthony,
 * 2026-10-05: "do the answers include links and can we format them better"):
 * the answer word for word — its links in the outside-link blue, its `[n]`
 * markers small links to the nth page it cites, the website's names and its
 * competitors' picked out — and beside it, on a wide screen, the pages it
 * cites, numbered as its markers count them.
 * Another model's writing: shown, never obeyed.
 */
export function ResearchAnswer({ answer, cited, names, others }: {
  answer: string;
  cited: ReadonlyArray<{ url: string }>;
  names: readonly string[];
  others: readonly string[];
}) {
  const t = useTranslations("keywordResearch.ai");
  const sources = cited.map((source) => withoutTracking(source.url));
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
      <div className="max-w-[75ch] text-[14px] text-secondary">
        <HakkenMarkdown content={cleanAnswer(answer)} highlight={names} highlightOthers={others} variant="answer" citations={sources} />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-[12px] font-medium text-foreground">{t("sources")}</p>
        {sources.length > 0 ? (
          <ol className="flex flex-col gap-1.5">
            {sources.map((url, index) => (
              <li key={`${index}-${url}`} className="flex min-w-0 items-baseline gap-2">
                <span className="w-5 shrink-0 text-right font-mono text-[11px] text-muted">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  {/* Only a web page is a link: the addresses come from the assistant, not from us. */}
                  {/^https?:\/\//i.test(url)
                    ? <ExternalUrlCell url={url} label={readableAddress(url).replace(/\/$/, "")} cut />
                    : <span className="block truncate text-[12px] text-muted">{url}</span>}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[12px] text-muted">{t("sourcesNone")}</p>
        )}
      </div>
    </div>
  );
}
