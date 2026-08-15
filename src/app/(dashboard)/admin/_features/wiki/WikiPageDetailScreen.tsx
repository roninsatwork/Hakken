"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { ArrowLeft, BookOpen, History, Loader2, Pin, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminPageHeader } from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";
import { AdminSaveError, AdminSaveFeedback } from "@/src/app/(dashboard)/admin/_components/AdminSaveControls";
import { AdminWriteButton } from "@/src/app/(dashboard)/admin/_components/AdminAccessLevel";
import { getErrorMessage } from "@/src/lib/errors";

/**
 * One tended page, mounted at two heights like the list (Anthony's ruling,
 * 2026-08-14). The three layers are the same everywhere: the pinned
 * corrections staff own, the machine-tended body an admin can edit, and the
 * walkable history. `companyId` picks the company-detail doors; without it
 * the active workspace's doors are used.
 */
export function WikiPageDetailScreen({
  pageId,
  companyId,
  basePath,
}: {
  pageId: Id<"wikiPages">;
  companyId?: Id<"companies">;
  basePath: string;
}) {
  const t = useTranslations("aiPages.detail");
  // Two doors, one mounted: hooks must both be called, so the unused door
  // is skipped rather than conditionally omitted.
  const tenantDetail = useQuery(api.wikiPages.getPageDetail, companyId ? "skip" : { pageId });
  const companyDetail = useQuery(
    api.wikiPages.getPageDetailForCompany,
    companyId ? { companyId, pageId } : "skip"
  );
  const detail = companyId ? companyDetail : tenantDetail;
  const editTenant = useMutation(api.wikiPages.editPageContent);
  const editCompany = useMutation(api.wikiPages.editPageContentForCompany);
  const pinTenant = useMutation(api.wikiPages.pinCorrection);
  const pinCompany = useMutation(api.wikiPages.pinCorrectionForCompany);
  const unpinTenant = useMutation(api.wikiPages.unpinCorrection);
  const unpinCompany = useMutation(api.wikiPages.unpinCorrectionForCompany);

  const editContent = (content: string) =>
    companyId ? editCompany({ companyId, pageId, content }) : editTenant({ pageId, content });
  const pin = (text: string) =>
    companyId ? pinCompany({ companyId, pageId, text }) : pinTenant({ pageId, text });
  const unpin = (pinnedAt: number) =>
    companyId ? unpinCompany({ companyId, pageId, pinnedAt }) : unpinTenant({ pageId, pinnedAt });

  const [draft, setDraft] = useState<string | null>(null);
  const [newPin, setNewPin] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // The draft follows the page until the person starts typing.
  useEffect(() => {
    if (detail && draft === null) setDraft(detail.content);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once per load
  }, [detail]);

  const describeSource = (source: string) => {
    if (source.startsWith("PHONE_CALL:")) return t("sources.phone");
    if (source.startsWith("EMAIL:")) return t("sources.email");
    if (source.startsWith("HUMAN:")) return t("sources.human");
    if (source === "TENDING") return t("sources.tending");
    return source;
  };

  const run = async (work: () => Promise<unknown>) => {
    setIsSaving(true);
    setErrorMessage("");
    setSaveStatus("idle");
    try {
      await work();
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error, t("errors.save")));
    } finally {
      setIsSaving(false);
    }
  };

  if (detail === undefined) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    );
  }
  if (detail === null) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-secondary">
        <p className="text-[14px]">{t("notFound")}</p>
        <Link href={basePath} className="text-[13px] text-brand hover:underline">
          {t("back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-12 w-full">
      <AdminPageHeader
        icon={<BookOpen className="w-6 h-6 text-brand" />}
        title={detail.title}
        description={t("subtitle", {
          source: describeSource(detail.lastRewriteSource),
          date: new Date(detail.updatedAt).toLocaleString(),
          count: detail.rewriteCount,
        })}
        divider
      />

      <Link
        href={basePath}
        className="flex items-center gap-2 text-[13px] text-secondary hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="w-4 h-4" />
        {t("back")}
      </Link>

      <AdminSaveFeedback
        status={saveStatus}
        successTitle={t("success.title")}
        successMessage={t("success.message")}
        errorTitle={t("errors.saveTitle")}
        errorMessage=""
      />
      <AdminSaveError>{errorMessage}</AdminSaveError>

      {/* The pinned layer: people outrank the machine, visibly. */}
      <section className="flex flex-col gap-3 rounded-[16px] border border-border-dim bg-card/40 p-5">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
          <Pin className="w-4 h-4 text-brand" />
          {t("pinned.title")}
        </h2>
        <p className="text-[12px] text-secondary">{t("pinned.hint")}</p>
        {detail.pinnedCorrections.length === 0 && (
          <p className="text-[13px] text-muted">{t("pinned.none")}</p>
        )}
        <ul className="flex flex-col gap-2">
          {detail.pinnedCorrections.map((correction) => (
            <li
              key={correction.pinnedAt}
              className="flex items-start justify-between gap-3 rounded-[10px] border border-border-dim/60 bg-background px-4 py-3"
            >
              <span className="text-[13px] text-foreground">{correction.text}</span>
              <AdminWriteButton
                onClick={() => void run(() => unpin(correction.pinnedAt))}
                disabled={isSaving}
                aria-label={t("pinned.remove")}
                title={t("pinned.remove")}
                className="text-muted hover:text-foreground transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </AdminWriteButton>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newPin}
            onChange={(event) => setNewPin(event.target.value)}
            placeholder={t("pinned.placeholder")}
            className="flex-1 bg-background border border-border-dim rounded-[10px] px-4 py-2.5 text-[13px] text-foreground placeholder:text-muted/60 focus:outline-none focus:border-brand/50 transition-colors"
          />
          <AdminWriteButton
            onClick={() =>
              void run(async () => {
                await pin(newPin);
                setNewPin("");
              })
            }
            disabled={isSaving || !newPin.trim()}
            className="px-4 py-2.5 rounded-[10px] bg-brand text-white text-[13px] font-medium disabled:opacity-40 transition-opacity"
          >
            {t("pinned.add")}
          </AdminWriteButton>
        </div>
      </section>

      {/* The machine-tended body, editable by an admin. */}
      <section className="flex flex-col gap-3 rounded-[16px] border border-border-dim bg-card/40 p-5">
        <h2 className="text-[14px] font-semibold text-foreground">{t("body.title")}</h2>
        <p className="text-[12px] text-secondary">{t("body.hint")}</p>
        <textarea
          value={draft ?? ""}
          onChange={(event) => setDraft(event.target.value)}
          rows={10}
          className="w-full bg-background border border-border-dim rounded-[10px] px-4 py-3 text-[13px] leading-relaxed text-foreground focus:outline-none focus:border-brand/50 transition-colors resize-y"
        />
        <div className="flex items-center gap-3">
          <AdminWriteButton
            onClick={() => void run(() => editContent(draft ?? ""))}
            disabled={isSaving || draft === null || draft.trim() === detail.content}
            className="px-4 py-2.5 rounded-[10px] bg-brand text-white text-[13px] font-medium disabled:opacity-40 transition-opacity w-fit"
          >
            {isSaving ? t("body.saving") : t("body.save")}
          </AdminWriteButton>
          {draft !== null && draft.trim() !== detail.content && (
            <button
              type="button"
              onClick={() => setDraft(detail.content)}
              className="text-[13px] text-secondary hover:text-foreground transition-colors"
            >
              {t("body.discard")}
            </button>
          )}
        </div>
      </section>

      {/* The receipts (design, screen 3): what taught this page. Originals
          are kept underneath the wiki precisely so these can always open. */}
      <section className="flex flex-col gap-3 rounded-[16px] border border-border-dim bg-card/40 p-5">
        <h2 className="text-[14px] font-semibold text-foreground">{t("sourcesPanel.title")}</h2>
        <p className="text-[12px] text-secondary">{t("sourcesPanel.hint")}</p>
        {detail.sources.length === 0 ? (
          <p className="text-[13px] text-muted">{t("sourcesPanel.none")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {detail.sources.map((source) => {
              const href =
                source.kind === "PHONE_CALL"
                  ? `/app/calls/${source.ref}`
                  : source.kind === "DOCUMENT" && companyId
                    ? `/admin/companies/${companyId}/ai/knowledge/${source.ref}`
                    : null;
              return (
                <li
                  key={`${source.kind}:${source.ref}`}
                  className="flex items-center justify-between gap-3 rounded-[9px] border border-border-dim/60 bg-background px-4 py-2.5 text-[13px]"
                >
                  <span className="text-secondary truncate">{source.label}</span>
                  {href ? (
                    <Link href={href} className="text-[12px] text-brand hover:underline whitespace-nowrap">
                      {t("sourcesPanel.open")}
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* The walkable history: which conversation taught which change. */}
      <section className="flex flex-col gap-3 rounded-[16px] border border-border-dim bg-card/40 p-5">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
          <History className="w-4 h-4 text-brand" />
          {t("history.title")}
        </h2>
        <p className="text-[12px] text-secondary">{t("history.hint")}</p>
        {detail.revisions.length === 0 ? (
          <p className="text-[13px] text-muted">{t("history.none")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {detail.revisions.map((revision) => (
              <li
                key={revision.createdAt}
                className="rounded-[10px] border border-border-dim/60 bg-background px-4 py-3"
              >
                <p className="text-[12px] font-medium text-secondary">
                  {describeSource(revision.source)} · {new Date(revision.createdAt).toLocaleString()}
                </p>
                <p className="mt-1 text-[13px] text-foreground/80 whitespace-pre-wrap">{revision.content}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
