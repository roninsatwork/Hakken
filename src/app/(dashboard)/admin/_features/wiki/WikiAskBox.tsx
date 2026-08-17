"use client";

import { useState } from "react";
import Link from "next/link";
import { useAction } from "convex/react";
import { useTranslations } from "next-intl";
import { Loader2, MessageCircle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { getErrorMessage } from "@/src/lib/errors";

/**
 * The Ask box (watch-it-think plan, phase 3): ask this brain a question
 * from inside its wiki and see the real answer with the pages it stood
 * on. Same card anatomy as the import box beside it; the ask is a real
 * model call, so the button is write-gated and pressed on purpose.
 */
export function WikiAskBox({
  companyId,
  basePath,
}: {
  companyId?: Id<"companies">;
  basePath: string;
}) {
  const t = useTranslations("aiPages.ask");
  const askCompany = useAction(api.wikiAsk.askBrainForCompany);
  const askGlobal = useAction(api.wikiAsk.askBrainForGlobal);

  const [question, setQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    answer: string;
    pages: Array<{ title: string; pageId: string; isPlatform: boolean }>;
  } | null>(null);

  const ask = async () => {
    const trimmed = question.trim();
    if (!trimmed) return;
    setIsAsking(true);
    setError("");
    setResult(null);
    try {
      const answer = companyId
        ? await askCompany({ companyId, question: trimmed })
        : await askGlobal({ question: trimmed });
      setResult(answer);
    } catch (err: unknown) {
      setError(getErrorMessage(err, t("error")));
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-border-dim bg-card/40 p-5">
      <h2 className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
        <MessageCircle className="w-4 h-4 text-brand" />
        {t("title")}
      </h2>
      <p className="text-[12px] text-secondary">{t("hint")}</p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void ask();
          }}
          placeholder={t("placeholder")}
          disabled={isAsking}
          className="flex-1 bg-background border border-border-dim rounded-[10px] px-4 py-2.5 text-[13px] text-foreground placeholder:text-muted/60 focus:outline-none focus:border-brand/50 transition-colors"
        />
        <WriteButton
          onClick={() => void ask()}
          disabled={isAsking || !question.trim()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] bg-brand text-white text-[13px] font-medium disabled:opacity-40 transition-opacity"
        >
          {isAsking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {isAsking ? t("asking") : t("askButton")}
        </WriteButton>
      </div>
      {error && <p className="text-[13px] text-destructive">{error}</p>}
      {result && (
        <div className="flex flex-col gap-3 rounded-[12px] border border-border-dim/60 bg-background px-4 py-3">
          <p className="text-[13.5px] leading-relaxed text-foreground/90 whitespace-pre-wrap">
            {result.answer}
          </p>
          {result.pages.length > 0 ? (
            <div className="flex flex-col gap-2 pt-2 border-t border-border-dim/60">
              <p className="text-[11px] uppercase tracking-[0.1em] text-muted font-medium">
                {t("stoodOn")}
              </p>
              <div className="flex flex-wrap gap-2">
                {result.pages.map((page) => (
                  <Link
                    key={page.pageId}
                    href={
                      page.isPlatform && companyId
                        ? `/admin/ai/knowledge/${page.pageId}`
                        : `${basePath}/${page.pageId}`
                    }
                    className="px-3 py-1.5 rounded-full border border-brand/35 bg-brand/10 text-brand text-[12.5px] hover:bg-brand/20 transition-colors"
                  >
                    {page.title.replace(/^https?:\/\//, "").slice(0, 42)}
                    {page.isPlatform && <span className="ml-1 text-muted">{t("platform")}</span>}
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[12px] text-muted pt-2 border-t border-border-dim/60">
              {t("noPages")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
