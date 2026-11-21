"use client";

import { useState } from "react";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import Link from "next/link";
import { useAction } from "convex/react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { buttonClasses } from "@/src/ui/components/screens/Button";
import { Field } from "@/src/ui/components/screens/Field";
import { SectionLabel } from "@/src/ui/components/screens/SectionLabel";
import { shortPageTitle } from "./wikiWords";

/**
 * Ask the wiki (watch-it-think plan, phase 3): ask a question and see the real
 * answer with the pages it stood on. The Ask the wiki page's body
 * (wiki-sonae-catch-up-plan-2026-11-21.md, S6), with no card round it. The ask
 * is a real model call, so the button is write-gated and pressed on purpose,
 * and it is the page's one orange action.
 */
export function WikiAskBox({
  companyId,
  basePath,
}: {
  companyId?: Id<"companies">;
  basePath: string;
}) {
  const t = useTranslations("aiPages.ask");
  const tScreen = useTranslations("aiPages.askScreen");
  const askCompany = useAction(api.wikiAsk.askBrainForCompany);
  const askGlobal = useAction(api.wikiAsk.askBrainForGlobal);

  const [question, setQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const action = useAdminAction({ scope: "admin-wiki-ask" });
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
    const outcome = await action.run(
      () => (companyId ? askCompany({ companyId, question: trimmed }) : askGlobal({ question: trimmed })),
      { key: "wiki-ask", suppressErrorToast: true, fallbackMessage: t("error") },
    );
    if (outcome.ok) setResult(outcome.data);
    else if (outcome.message) setError(outcome.message);
    setIsAsking(false);
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-[1_1_320px]">
          <Field
            label={tScreen("label")}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void ask();
            }}
            placeholder={t("placeholder")}
            disabled={isAsking}
          />
        </div>
        <WriteButton
          type="button"
          onClick={() => void ask()}
          disabled={isAsking || !question.trim()}
          className={buttonClasses("brand", "inline-flex items-center gap-2 whitespace-nowrap")}
        >
          {isAsking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {isAsking ? t("asking") : t("askButton")}
        </WriteButton>
      </div>

      {error ? (
        <p className="text-[13px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <section aria-live="polite" className="flex flex-col gap-3 border-t border-border-dim pt-5">
          <SectionLabel>{tScreen("answer")}</SectionLabel>
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">{result.answer}</p>
          {result.pages.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-[13px] text-secondary">{t("stoodOn")}</p>
              {result.pages.map((page) => (
                <Link
                  key={page.pageId}
                  href={page.isPlatform && companyId ? `/admin/ai/knowledge/${page.pageId}` : `${basePath}/${page.pageId}`}
                  className="w-fit max-w-full break-words text-[13px] text-foreground underline underline-offset-[3px] hover:text-secondary"
                >
                  {shortPageTitle(page.title)}
                  {page.isPlatform ? <span className="ml-1 text-secondary">{t("platform")}</span> : null}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-secondary">{t("noPages")}</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
