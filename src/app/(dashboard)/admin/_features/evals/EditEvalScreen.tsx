"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { ClipboardCheck, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  ModalField,
  ModalFormError,
  ModalFormField,
  ModalTextAreaField,
  modalInputClassName,
} from "@/src/ui/components/screens/ModalForm";
import { CompanySkillCheckboxPicker } from "@/src/app/(dashboard)/admin/_components/CompanySkillCheckboxPicker";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import {
  CompanyAiFormActions,
  CompanyAiFormPageHeader,
  getSafeCompanyAiReturnTo,
  getSafeGlobalAiReturnTo,
} from "@/src/app/(dashboard)/admin/companies/[id]/ai/_components/CompanyAiFormPage";

type CompanyEvalCase = Doc<"companyEvalCases">;
type EvalTargetSurface = CompanyEvalCase["targetSurface"];

/**
 * Five fields, and nothing to type in code.
 *
 * This form had fifteen, three of them raw JSON textareas and one a ten-option
 * dropdown of machine constants that fed a field nothing ever read. A capable
 * person who does not build software could not fill it in, and a misplaced bracket
 * failed quietly.
 *
 * What survives is what an eval actually is: a question, a description of a good
 * answer, optionally some phrases it must never say, whether it gates going live,
 * and where it applies. Category is gone entirely. Severity is an evalbox. The
 * "judge rubric" box is merged into the description of a good answer, because two
 * boxes asking the same question is why neither got filled in.
 */
const WHERE_OPTIONS: Array<{ value: EvalTargetSurface; labelKey: string; hintKey: string }> = [
  { value: "COMPANY_CHAT", labelKey: "where.internalChat", hintKey: "where.internalChatHint" },
  { value: "WIDGET", labelKey: "where.widget", hintKey: "where.widgetHint" },
];

const DEFAULT_FORM = {
  name: "",
  prompt: "",
  expectedBehavior: "",
  targetSurface: "COMPANY_CHAT" as EvalTargetSurface,
  mustPass: true,
  sampleCount: 1,
};

type CheckForm = typeof DEFAULT_FORM;

function parsePhrases(value: string | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Writing or editing an eval, at both heights.
 *
 * One form for both jobs, because they were the same five questions asked twice:
 * before this screen existed a typo meant archiving the eval and starting again,
 * which lost its history too. With an `evalCaseId` it edits that eval; without
 * one it creates a new one. Without a company it belongs to the global AI —
 * no skills to require, because skills belong to companies.
 *
 * This shared body lives in EditEvalScreen.tsx rather than a file of its own
 * because it carries the one raw chip-dismiss button element this file's
 * screen-kit budget already allows for — the allowlist may shrink, never grow.
 */
export function EvalCaseFormScreen({
  companyId,
  evalCaseId,
}: {
  companyId?: Id<"companies">;
  evalCaseId?: Id<"companyEvalCases">;
}) {
  const isEdit = evalCaseId !== undefined;
  const t = useTranslations("ai.evals.form");
  const router = useRouter();
  const searchParams = useSearchParams();
  const fallbackHref = companyId ? `/admin/companies/${companyId}/ai/evals` : "/admin/ai/evals";
  const backHref = companyId
    ? getSafeCompanyAiReturnTo(searchParams.get("returnTo"), companyId, fallbackHref)
    : getSafeGlobalAiReturnTo(searchParams.get("returnTo"), fallbackHref);

  const evalCase = useQuery(api.companyEvals.getCaseById, evalCaseId ? { evalCaseId } : "skip");
  const createCase = useMutation(api.companyEvals.createCase);
  const updateCase = useMutation(api.companyEvals.updateCase);
  const activeSkills = usePaginatedQuery(
    api.companySkills.getSkillsForCompany,
    !isEdit && companyId ? { companyId, status: "ACTIVE" } : "skip",
    { initialNumItems: TABLE_PAGE_SIZE }
  );
  const action = useAdminAction({ scope: isEdit ? "admin-company-eval-edit" : "admin-company-ai" });

  // The stored eval is the value until the reader changes something, at which point
  // the draft takes over. Copying the query into state inside an effect would fight
  // the reader's typing every time the query refreshed, which is why the codebase
  // forbids it. A new eval starts from the defaults the same way.
  const [draft, setDraft] = useState<CheckForm | null>(null);
  const [phraseDraftList, setPhraseDraftList] = useState<string[] | null>(null);
  const [phraseDraft, setPhraseDraft] = useState("");
  const [requiredSkillIds, setRequiredSkillIds] = useState<Array<Id<"companySkills">>>([]);

  const stored: CheckForm = isEdit
    ? {
        name: evalCase?.name ?? "",
        prompt: evalCase?.prompt ?? "",
        expectedBehavior: evalCase?.expectedBehavior ?? "",
        targetSurface: evalCase?.targetSurface === "WIDGET" ? "WIDGET" : "COMPANY_CHAT",
        mustPass: evalCase?.severity === "BLOCKER",
        sampleCount: 1,
      }
    : DEFAULT_FORM;
  const form = draft ?? stored;
  const bannedPhrases = phraseDraftList ?? (isEdit ? parsePhrases(evalCase?.forbiddenClaimsJson) : []);
  const setForm = (update: (current: CheckForm) => CheckForm) => setDraft(update(form));
  const setBannedPhrases = (update: (current: string[]) => string[]) => setPhraseDraftList(update(bannedPhrases));

  const addPhrase = () => {
    const phrase = phraseDraft.trim();
    if (!phrase || bannedPhrases.includes(phrase)) {
      setPhraseDraft("");
      return;
    }
    setBannedPhrases((current) => [...current, phrase]);
    setPhraseDraft("");
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    const outcome = await action.run(
      () =>
        evalCaseId
          ? updateCase({
              evalCaseId,
              name: form.name,
              severity: form.mustPass ? "BLOCKER" : "ADVISORY",
              targetSurface: form.targetSurface,
              prompt: form.prompt,
              expectedBehavior: form.expectedBehavior,
              forbiddenClaimsJson: bannedPhrases.length > 0 ? JSON.stringify(bannedPhrases) : "",
            })
          : createCase({
              ...(companyId ? { companyId } : {}),
              name: form.name,
              severity: form.mustPass ? "BLOCKER" : "ADVISORY",
              targetSurface: form.targetSurface,
              prompt: form.prompt,
              expectedBehavior: form.expectedBehavior,
              // Built from the tag list, so nobody types JSON.
              forbiddenClaimsJson: bannedPhrases.length > 0 ? JSON.stringify(bannedPhrases) : undefined,
              requiredSkillsJson: requiredSkillIds.length > 0 ? JSON.stringify(requiredSkillIds) : undefined,
              sampleCount: form.sampleCount,
            }),
      {
        fallbackMessage: isEdit ? t("saveFailed") : t("createFailed"),
        // The form renders the message itself, so a toast would repeat it.
        suppressErrorToast: true,
      }
    );
    if (outcome.ok) router.push(backHref);
  };

  if (isEdit && evalCase === undefined) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <CompanyAiFormPageHeader
        backHref={backHref}
        title={isEdit ? t("editTitle") : t("newTitle")}
        description={isEdit ? t("editDescription") : t("newDescription")}
        icon={<ClipboardCheck className="h-6 w-6 text-brand" />}
      />

      <form onSubmit={handleSave} className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
        <div className="flex flex-col gap-5">
          <ModalFormError>{action.error}</ModalFormError>

          <ModalField
            label={t("nameLabel")}
            value={form.name}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder={isEdit ? undefined : t("namePlaceholder")}
          />

          <ModalTextAreaField
            label={t("promptLabel")}
            required
            minHeightClassName="min-h-[110px]"
            value={form.prompt}
            onChange={(event) => setForm((current) => ({ ...current, prompt: event.target.value }))}
            placeholder={isEdit ? undefined : t("promptPlaceholder")}
          />

          <ModalTextAreaField
            label={t("goodAnswerLabel")}
            hint={t("goodAnswerHint")}
            required
            minHeightClassName="min-h-[130px]"
            value={form.expectedBehavior}
            onChange={(event) => setForm((current) => ({ ...current, expectedBehavior: event.target.value }))}
            placeholder={isEdit ? undefined : t("goodAnswerPlaceholder")}
          />

          {/* A tag list, not a JSON array. The old form asked for ["enterprise is
              free"] typed by hand, brackets and quotes included. */}
          <ModalField
            label={t("bannedLabel")}
            hint={t("bannedHint")}
            value={phraseDraft}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setPhraseDraft(event.target.value)}
            onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addPhrase();
              }
            }}
            onBlur={addPhrase}
            placeholder={t("bannedPlaceholder")}
          >
            <div className="flex flex-col gap-2">
              {bannedPhrases.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {bannedPhrases.map((phrase) => (
                    <span key={phrase} className="inline-flex items-center gap-1.5 rounded-full border border-border-dim bg-foreground/5 px-3 py-1 text-[12px] text-foreground">
                      {phrase}
                      {/* Raw: bare dismiss glyph inside a chip — the icon variant's padding and hover fill would reshape it. */}
                      <button
                        type="button"
                        aria-label={t("removePhrase", { phrase })}
                        onClick={() => setBannedPhrases((current) => current.filter((entry) => entry !== phrase))}
                        className="text-muted transition-colors hover:text-red-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </ModalField>

          <ModalFormField label={t("whereLabel")}>
            <div className="flex flex-col gap-2">
              {WHERE_OPTIONS.map((option) => (
                <label key={option.value} className="flex cursor-pointer items-start gap-3 rounded-[8px] border border-border-dim px-3 py-2.5 transition-colors hover:bg-foreground/5">
                  <input
                    type="radio"
                    name="where"
                    checked={form.targetSurface === option.value}
                    onChange={() => setForm((current) => ({ ...current, targetSurface: option.value }))}
                    className="mt-0.5 accent-brand"
                  />
                  <span>
                    <span className="block text-[13px] font-semibold text-foreground">{t(option.labelKey)}</span>
                    <span className="block text-[12px] text-secondary">{t(option.hintKey)}</span>
                  </span>
                </label>
              ))}
            </div>
          </ModalFormField>

          <label className="flex cursor-pointer items-start gap-3 rounded-[8px] border border-border-dim px-3 py-2.5 transition-colors hover:bg-foreground/5">
            <input
              type="checkbox"
              checked={form.mustPass}
              onChange={(event) => setForm((current) => ({ ...current, mustPass: event.target.checked }))}
              className="mt-0.5 accent-brand"
            />
            <span>
              <span className="block text-[13px] font-semibold text-foreground">{t("mustPassLabel")}</span>
              <span className="block text-[12px] text-secondary">{t("mustPassHint")}</span>
            </span>
          </label>

          {/* Collapsed, so the form still reads as five questions. Requiring a skill
              only became meaningful once runs started recording which skills reached
              the model; before that, such an eval could never pass. */}
          {!isEdit && (
            <details className="rounded-[8px] border border-border-dim px-3 py-2.5">
              <summary className="cursor-pointer text-[13px] font-semibold text-foreground">
                {t("advanced")}
              </summary>
              <div className="mt-4">
                <ModalFormField
                  label={t("sampleLabel")}
                  hint={t("sampleHint")}
                  htmlFor="new-eval-sample-count"
                >
                  <select
                    id="new-eval-sample-count"
                    className={modalInputClassName}
                    value={String(form.sampleCount)}
                    onChange={(event) => setForm((current) => ({ ...current, sampleCount: Number(event.target.value) }))}
                  >
                    <option value="1">{t("askOnce")}</option>
                    <option value="3">{t("askThree")}</option>
                    <option value="5">{t("askFive")}</option>
                  </select>
                </ModalFormField>
                {companyId && (
                <ModalFormField
                  label={t("skillsLabel")}
                  hint={t("skillsHint", { count: requiredSkillIds.length })}
                >
                  <CompanySkillCheckboxPicker
                    skills={activeSkills.results}
                    selectedSkillIds={requiredSkillIds}
                    status={activeSkills.status}
                    emptyMessage={t("skillsEmpty")}
                    onToggleSkill={(skillId) => setRequiredSkillIds((current) =>
                      current.includes(skillId)
                        ? current.filter((id) => id !== skillId)
                        : [...current, skillId]
                    )}
                    onLoadMore={() => activeSkills.loadMore(TABLE_PAGE_SIZE)}
                  />
                </ModalFormField>
                )}
              </div>
            </details>
          )}

          <CompanyAiFormActions
            backHref={backHref}
            submitLabel={
              isEdit
                ? action.isBusy() ? t("saving") : t("saveCheck")
                : action.isBusy() ? t("creating") : t("createEval")
            }
            isSubmitting={action.isBusy()}
          />
        </div>
      </form>
    </div>
  );
}

/** Editing an eval, at both heights. */
export function EditEvalScreen({
  companyId,
  evalCaseId,
}: {
  companyId?: Id<"companies">;
  evalCaseId: Id<"companyEvalCases">;
}) {
  return <EvalCaseFormScreen companyId={companyId} evalCaseId={evalCaseId} />;
}
