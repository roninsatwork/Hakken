"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { useCanWriteHere } from "@/src/ui/components/screens/AccessLevel";
import { Button } from "@/src/ui/components/screens/Button";
import { DecisionLabel } from "@/src/ui/components/screens/DecisionLabel";
import { FormSection } from "@/src/ui/components/screens/FormSection";

/**
 * What the wiki won't decide by itself (wiki-sonae-catch-up-plan-2026-11-21.md,
 * S6, from the upstream framework's `be63693c`): imports someone asked to
 * review first, each with yes or no, and open questions where two pages
 * disagree, each with both claims, the Decision that raised it and Dismiss.
 * They sat half-way down the wiki's long page as boxes; now they are the
 * Waiting on you page, as plain rows under two headings.
 *
 * Its buttons are for people who can write: a read-only viewer sees what
 * is waiting and nothing to press.
 */
export function WikiWaitingList({ companyId, basePath }: { companyId?: Id<"companies">; basePath: string }) {
  const t = useTranslations("aiPages");
  const tDecisions = useTranslations("decisions");
  const canWrite = useCanWriteHere();
  const action = useAdminAction({ scope: "admin-wiki-waiting" });

  const globalReviews = useQuery(api.wikiReviews.listPendingReviewsForGlobal, companyId ? "skip" : {});
  const companyReviews = useQuery(api.wikiReviews.listPendingReviewsForCompany, companyId ? { companyId } : "skip");
  const reviews = companyId ? companyReviews : globalReviews;
  const decideGlobal = useMutation(api.wikiReviews.decideReviewForGlobal);
  const decideCompany = useMutation(api.wikiReviews.decideReviewForCompany);

  const globalQuestions = useQuery(api.wikiQuestions.listOpenQuestionsForGlobal, companyId ? "skip" : {});
  const companyQuestions = useQuery(api.wikiQuestions.listOpenQuestionsForCompany, companyId ? { companyId } : "skip");
  const questions = companyId ? companyQuestions : globalQuestions;
  const dismissGlobal = useMutation(api.wikiQuestions.dismissOpenQuestionForGlobal);
  const dismissCompany = useMutation(api.wikiQuestions.dismissOpenQuestionForCompany);

  // A question names its pages by kind and key; the map's light list of pages
  // turns each into a link. Read only when there is a question to link.
  const hasQuestions = (questions?.length ?? 0) > 0;
  const globalMap = useQuery(api.wikiPages.listPagesForMapForGlobal, !companyId && hasQuestions ? {} : "skip");
  const companyMap = useQuery(api.wikiPages.listPagesForMapForCompany, companyId && hasQuestions ? { companyId } : "skip");
  const pageIdByKey = new Map(
    ((companyId ? companyMap : globalMap) ?? []).map((page) => [`${page.kind}:${page.subjectKey}`, page.pageId]),
  );

  if (reviews === undefined || questions === undefined) return null;

  type ReviewId = (typeof reviews)[number]["reviewId"];
  type QuestionId = (typeof questions)[number]["questionId"];
  const decide = (reviewId: ReviewId, approve: boolean) =>
    void action.run(
      () => (companyId ? decideCompany({ companyId, reviewId, approve }) : decideGlobal({ reviewId, approve })),
      { key: `review:${reviewId}`, fallbackMessage: t("reviews.failed") },
    );
  const dismiss = (questionId: QuestionId) =>
    void action.run(
      () => (companyId ? dismissCompany({ companyId, questionId }) : dismissGlobal({ questionId })),
      { key: `question:${questionId}`, fallbackMessage: t("questions.dismissFailed") },
    );

  const pageLink = (pageKey: string) => {
    const name = pageKey.split(":").slice(1).join(":") || pageKey;
    const pageId = pageIdByKey.get(pageKey);
    return pageId ? (
      <Link
        href={`${basePath}/${pageId}`}
        className="w-fit max-w-full break-words text-[13px] text-secondary underline underline-offset-[3px] hover:text-foreground"
      >
        {name}
      </Link>
    ) : (
      <span className="break-words text-[13px] text-secondary">{name}</span>
    );
  };

  if (reviews.length === 0 && questions.length === 0) {
    return <p className="text-[13px] text-secondary">{t("waitingScreen.empty")}</p>;
  }

  return (
    <div className="flex min-w-0 flex-col">
      {reviews.length > 0 ? (
        <FormSection title={t("reviews.title", { count: reviews.length })} hint={t("reviews.hint")} columns={1}>
          <ul className="flex flex-col divide-y divide-border-dim">
            {reviews.map((review) => {
              const busy = action.isBusy(`review:${review.reviewId}`);
              return (
                <li key={review.reviewId} className="flex min-w-0 flex-col gap-3 py-4 first:pt-0">
                  <span className="break-words text-[13px] font-semibold text-foreground">{review.title}</span>
                  {review.claims.length > 0 ? (
                    <ul className="flex min-w-0 list-disc flex-col gap-1.5 pl-[18px] text-[13px] leading-relaxed text-foreground">
                      {review.claims.map((claim, index) => (
                        <li key={index} className="break-words">
                          {claim}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {canWrite ? (
                    // Both go grey while the answer saves.
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" className="text-foreground" disabled={busy} onClick={() => decide(review.reviewId, true)}>
                        {t("reviews.approve")}
                      </Button>
                      <Button variant="ghost" disabled={busy} onClick={() => decide(review.reviewId, false)}>
                        {t("reviews.reject")}
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </FormSection>
      ) : null}

      {questions.length > 0 ? (
        <FormSection title={t("questions.title", { count: questions.length })} hint={t("questions.hint")} columns={1}>
          <ul className="flex flex-col divide-y divide-border-dim">
            {questions.map((question) => (
              <li key={question.questionId} className="flex min-w-0 flex-col gap-2.5 py-4 first:pt-0">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    {pageLink(question.pageKeyA)}
                    <span className="break-words text-[13px] leading-relaxed text-foreground">“{question.claimA}”</span>
                  </div>
                  {question.pageKeyB && question.claimB ? (
                    <div className="flex min-w-0 flex-col gap-1">
                      {pageLink(question.pageKeyB)}
                      <span className="break-words text-[13px] leading-relaxed text-foreground">“{question.claimB}”</span>
                    </div>
                  ) : null}
                </div>
                {question.detail ? <p className="break-words text-[13px] text-secondary">{question.detail}</p> : null}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {question.decisionCopyKey ? (
                    <DecisionLabel name={tDecisions(`catalogue.${question.decisionCopyKey}.name`)} certainty={question.certainty} />
                  ) : (
                    <span />
                  )}
                  {canWrite ? (
                    <Button
                      variant="ghost"
                      className="px-2 py-1"
                      disabled={action.isBusy(`question:${question.questionId}`)}
                      onClick={() => dismiss(question.questionId)}
                    >
                      {t("questions.dismiss")}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </FormSection>
      ) : null}
    </div>
  );
}
