"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { ArrowLeft, History, Loader2, Pencil, Pin, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminSaveError, AdminSaveFeedback } from "@/src/app/(dashboard)/admin/_components/AdminSaveControls";
import { AdminWriteButton } from "@/src/app/(dashboard)/admin/_components/AdminAccessLevel";
import { getErrorMessage } from "@/src/lib/errors";
import { WikiProse } from "./WikiProse";
import { WikiQuickSwitcher } from "./WikiQuickSwitcher";
import { WikiLocalGraph } from "./WikiLocalGraph";

/**
 * One page of the wiki, READ FIRST (Anthony's ruling, 2026-08-17: "an
 * actual wiki I can click around"): the document typeset with live
 * links and hover peeks, pinned facts on top, related pages and
 * backlinks underneath — and the housekeeping (editing, receipts,
 * history, pinning) behind buttons where a reader isn't forced through
 * it. Mounted at two heights like the list.
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
  const tKinds = useTranslations("aiPages.kinds");
  // Two doors, one mounted: hooks must both be called, so the unused door
  // is skipped rather than conditionally omitted.
  const globalDetail = useQuery(
    api.wikiPages.getPageDetailForGlobal,
    companyId ? "skip" : { pageId }
  );
  const companyDetail = useQuery(
    api.wikiPages.getPageDetailForCompany,
    companyId ? { companyId, pageId } : "skip"
  );
  const detail = companyId ? companyDetail : globalDetail;
  const editGlobal = useMutation(api.wikiPages.editPageContentForGlobal);
  const editCompany = useMutation(api.wikiPages.editPageContentForCompany);
  const pinGlobal = useMutation(api.wikiPages.pinCorrectionForGlobal);
  const pinCompany = useMutation(api.wikiPages.pinCorrectionForCompany);
  const unpinGlobal = useMutation(api.wikiPages.unpinCorrectionForGlobal);
  const unpinCompany = useMutation(api.wikiPages.unpinCorrectionForCompany);

  const editContent = (content: string) =>
    companyId ? editCompany({ companyId, pageId, content }) : editGlobal({ pageId, content });
  const pin = (text: string) =>
    companyId ? pinCompany({ companyId, pageId, text }) : pinGlobal({ pageId, text });
  const unpin = (pinnedAt: number) =>
    companyId ? unpinCompany({ companyId, pageId, pinnedAt }) : unpinGlobal({ pageId, pinnedAt });

  const [isEditing, setIsEditing] = useState(false);
  const [openFold, setOpenFold] = useState<"none" | "sources" | "history" | "pin">("none");
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
    if (source.startsWith("CHAT:")) return t("sources.chat");
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

  const documentSources = detail.sources.filter((source) => source.kind === "DOCUMENT").length;
  const conversationSources = detail.sources.length - documentSources;

  return (
    <div className="flex flex-col gap-5 pb-12 w-full">
      <WikiQuickSwitcher companyId={companyId} basePath={basePath} />
      {/* Breadcrumb road back. */}
      <div className="flex items-center gap-2 text-[12px] text-muted">
        <Link href={basePath} className="hover:text-foreground transition-colors flex items-center gap-1.5">
          <ArrowLeft className="w-3.5 h-3.5" />
          {t("breadcrumbWiki")}
        </Link>
        <span>/</span>
        <span>{tKinds(detail.kind)}</span>
        <span>/</span>
        <span className="text-secondary">{detail.subjectKey}</span>
      </div>

      {/* Title row: reading first, the housekeeping as buttons. */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-[26px] font-bold tracking-tight text-foreground">
          {detail.title}
          <span className="ml-3 px-2.5 py-1 rounded-full bg-foreground/5 border border-border-dim/60 text-secondary text-[12px] font-medium align-[6px]">
            {tKinds(detail.kind)}
          </span>
        </h1>
        <span className="flex items-center gap-2">
          <AdminWriteButton
            onClick={() => {
              setIsEditing((current) => !current);
              setDraft(detail.content);
            }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-[10px] border text-[13px] font-medium transition-colors ${
              isEditing
                ? "border-brand/50 text-brand bg-brand/10"
                : "border-border-dim text-secondary hover:text-foreground"
            }`}
          >
            <Pencil className="w-3.5 h-3.5" />
            {isEditing ? t("read.reading") : t("read.edit")}
          </AdminWriteButton>
          <button
            type="button"
            onClick={() => setOpenFold((current) => (current === "history" ? "none" : "history"))}
            className="flex items-center gap-1.5 px-4 py-2 rounded-[10px] border border-border-dim text-secondary hover:text-foreground text-[13px] font-medium transition-colors"
          >
            <History className="w-3.5 h-3.5" />
            {t("read.history")}
          </button>
        </span>
      </div>

      <p className="text-[12.5px] text-muted -mt-2">
        {t("read.meta", {
          documents: documentSources,
          conversations: conversationSources,
          source: describeSource(detail.lastRewriteSource),
          date: new Date(detail.updatedAt).toLocaleDateString(),
        })}
        {" · "}
        {detail.usageCount > 0
          ? t("usage", {
              count: detail.usageCount,
              date: detail.lastUsedAt ? new Date(detail.lastUsedAt).toLocaleDateString() : "",
            })
          : t("usageNever")}
      </p>

      <AdminSaveFeedback
        status={saveStatus}
        successTitle={t("success.title")}
        successMessage={t("success.message")}
        errorTitle={t("errors.saveTitle")}
        errorMessage=""
      />
      <AdminSaveError>{errorMessage}</AdminSaveError>

      {/* Pinned facts ride on top: Sonae always respects them. */}
      {detail.pinnedCorrections.map((correction) => (
        <div
          key={correction.pinnedAt}
          className="flex items-start justify-between gap-3 rounded-[12px] border border-brand/30 bg-brand/5 px-4 py-3"
        >
          <span className="flex gap-2.5 text-[13.5px] text-foreground">
            <Pin className="w-4 h-4 text-brand shrink-0 mt-0.5" />
            <span>
              {correction.text}
              <span className="block text-[11.5px] text-muted mt-0.5">{t("pinned.hintShort")}</span>
            </span>
          </span>
          <AdminWriteButton
            onClick={() => void run(() => unpin(correction.pinnedAt))}
            disabled={isSaving}
            aria-label={t("pinned.remove")}
            title={t("pinned.remove")}
            className="text-muted hover:text-foreground transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </AdminWriteButton>
        </div>
      ))}

      {/* The document itself — or the editor, when asked for. */}
      {isEditing ? (
        <section className="flex flex-col gap-3 rounded-[16px] border border-border-dim bg-card/40 p-5">
          <p className="text-[12px] text-secondary">{t("body.hint")}</p>
          <textarea
            value={draft ?? ""}
            onChange={(event) => setDraft(event.target.value)}
            rows={14}
            className="w-full bg-background border border-border-dim rounded-[10px] px-4 py-3 text-[13px] leading-relaxed text-foreground focus:outline-none focus:border-brand/50 transition-colors resize-y"
          />
          <div className="flex items-center gap-3">
            <AdminWriteButton
              onClick={() =>
                void run(async () => {
                  await editContent(draft ?? "");
                  setIsEditing(false);
                })
              }
              disabled={isSaving || draft === null || draft.trim() === detail.content}
              className="px-4 py-2.5 rounded-[10px] bg-brand text-white text-[13px] font-medium disabled:opacity-40 transition-opacity w-fit"
            >
              {isSaving ? t("body.saving") : t("body.save")}
            </AdminWriteButton>
            <button
              type="button"
              onClick={() => {
                setDraft(detail.content);
                setIsEditing(false);
              }}
              className="text-[13px] text-secondary hover:text-foreground transition-colors"
            >
              {t("body.discard")}
            </button>
          </div>
        </section>
      ) : (
        <WikiProse
          content={detail.content}
          resolvedLinks={detail.resolvedLinks}
          basePath={basePath}
          rawCapture={detail.kind === "SOURCE"}
        />
      )}

      {/* Related pages: where a reader goes next. */}
      {detail.resolvedLinks.length > 0 && !isEditing && (
        <div className="flex flex-col gap-2.5 pt-2 border-t border-border-dim">
          <p className="text-[11px] uppercase tracking-[0.1em] text-muted font-medium">
            {t("read.related")}
          </p>
          <div className="flex flex-wrap gap-2">
            {detail.resolvedLinks.map((link) => (
              <Link
                key={link.key}
                href={`${basePath}/${link.pageId}`}
                className="px-3 py-1.5 rounded-full border border-brand/35 bg-brand/10 text-brand text-[12.5px] hover:bg-brand/20 transition-colors"
              >
                {/* Source notes are keyed by document id; the chip wears
                    the readable title instead. */}
                {link.key.startsWith("SOURCE:")
                  ? link.title.replace(/^https?:\/\//, "").slice(0, 42)
                  : link.slug}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Backlinks: how you wander a brain. */}
      {detail.backlinks.length > 0 && !isEditing && (
        <div className="flex flex-col gap-1 pt-2 border-t border-border-dim">
          <p className="text-[11px] uppercase tracking-[0.1em] text-muted font-medium mb-1.5">
            {t("read.backlinks", { count: detail.backlinks.length })}
          </p>
          {detail.backlinks.map((backlink) => (
            <div
              key={backlink.pageId}
              className="flex items-baseline gap-3 py-2 border-b border-border-dim/50 last:border-b-0"
            >
              <Link
                href={`${basePath}/${backlink.pageId}`}
                className="text-[13.5px] text-brand hover:underline whitespace-nowrap"
              >
                {backlink.kind === "SOURCE"
                  ? backlink.title.replace(/^https?:\/\//, "").slice(0, 42)
                  : backlink.subjectKey}
              </Link>
              <span className="text-[12.5px] text-muted truncate">{backlink.quote}</span>
            </div>
          ))}
        </div>
      )}

      {/* Where you're standing: the page's own neighbourhood
          (living-wiki plan, phase 2). */}
      {!isEditing && (detail.resolvedLinks.length > 0 || detail.backlinks.length > 0) && (
        <WikiLocalGraph
          title={detail.title}
          kind={detail.kind}
          resolvedLinks={detail.resolvedLinks}
          backlinks={detail.backlinks}
          basePath={basePath}
        />
      )}

      {/* The quiet strip: receipts, history, pinning — there when
          governing, out of the way when reading. */}
      <div className="flex flex-wrap gap-3 pt-2 border-t border-border-dim text-[12.5px] text-muted">
        <button
          type="button"
          onClick={() => setOpenFold((current) => (current === "sources" ? "none" : "sources"))}
          className={`px-3.5 py-1.5 rounded-full border transition-colors ${
            openFold === "sources" ? "border-brand/50 text-brand" : "border-border-dim hover:text-foreground"
          }`}
        >
          {t("read.foldSources", { count: detail.sources.length })}
        </button>
        <button
          type="button"
          onClick={() => setOpenFold((current) => (current === "history" ? "none" : "history"))}
          className={`px-3.5 py-1.5 rounded-full border transition-colors ${
            openFold === "history" ? "border-brand/50 text-brand" : "border-border-dim hover:text-foreground"
          }`}
        >
          {t("read.foldHistory", { count: detail.revisions.length })}
        </button>
        <button
          type="button"
          onClick={() => setOpenFold((current) => (current === "pin" ? "none" : "pin"))}
          className={`px-3.5 py-1.5 rounded-full border transition-colors ${
            openFold === "pin" ? "border-brand/50 text-brand" : "border-border-dim hover:text-foreground"
          }`}
        >
          {t("read.foldPin")}
        </button>
      </div>

      {openFold === "sources" && (
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
      )}

      {openFold === "history" && (
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
      )}

      {openFold === "pin" && (
        <section className="flex flex-col gap-3 rounded-[16px] border border-border-dim bg-card/40 p-5">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
            <Pin className="w-4 h-4 text-brand" />
            {t("pinned.title")}
          </h2>
          <p className="text-[12px] text-secondary">{t("pinned.hint")}</p>
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
                  setOpenFold("none");
                })
              }
              disabled={isSaving || !newPin.trim()}
              className="px-4 py-2.5 rounded-[10px] bg-brand text-white text-[13px] font-medium disabled:opacity-40 transition-opacity"
            >
              {t("pinned.add")}
            </AdminWriteButton>
          </div>
        </section>
      )}
    </div>
  );
}
