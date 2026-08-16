"use client";

import { useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { FileUp, Globe, Loader2, Type, FolderOpen } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminWriteButton } from "@/src/app/(dashboard)/admin/_components/AdminAccessLevel";
import { getErrorMessage } from "@/src/lib/errors";
import { resolveUploadContentType, validateUploadFile } from "@/src/lib/constants/uploads";
import {
  buildUploadTitle,
  collectPickedFiles,
} from "@/src/app/(dashboard)/admin/_features/knowledge/knowledgeUploadUtils";

/**
 * The one import (wiki-replaces-knowledge plan, screen 1): a website, a
 * file or some text goes in here, and what comes back is wiki pages — the
 * distiller runs off the same ingestion this box triggers, so there is
 * nothing to run twice and no second button anywhere. Calls the exact
 * doors the Knowledge screen has always called; those screens retire in
 * stage three, this box is their successor.
 */
export function WikiImportBox({ companyId }: { companyId?: Id<"companies"> }) {
  const t = useTranslations("aiPages.import");
  const mapWebsite = useAction(api.knowledgeActions.mapWebsite);
  const queueWebsiteUrls = useMutation(api.knowledge.queueWebsiteUrls);
  const saveManualText = useMutation(api.knowledge.saveManualText);
  const generateUploadUrl = useMutation(api.knowledge.generateUploadUrl);
  const saveDocument = useMutation(api.knowledge.saveDocument);
  const startKnowledgeFileQueue = useMutation(api.knowledge.startKnowledgeFileQueue);

  const scopeArgs = companyId ? { companyId } : {};
  const [tab, setTab] = useState<"website" | "file" | "text" | "vault">("website");
  // The Reviewer's checkpoint (wiki-agents plan, phase 4): tick it and the
  // wiki writes nothing from this import until you approve the claims.
  // On the platform shelf the checkpoint starts ticked: anything imported
  // there can reach every company's answers (global-wiki-plan.md, rule 2).
  const [reviewFirst, setReviewFirst] = useState(!companyId);
  const [url, setUrl] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const [textBody, setTextBody] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const vaultInputRef = useRef<HTMLInputElement>(null);

  const run = async (work: () => Promise<string>) => {
    setIsBusy(true);
    setError("");
    setFeedback("");
    try {
      setFeedback(await work());
    } catch (err: unknown) {
      setError(getErrorMessage(err, t("errors.generic")));
    } finally {
      setIsBusy(false);
    }
  };

  const importWebsite = () =>
    run(async () => {
      const cleaned = url.trim();
      if (!cleaned) throw new Error(t("errors.missingUrl"));
      const links: string[] = await mapWebsite({ url: cleaned });
      await queueWebsiteUrls({ ...scopeArgs, urls: links, wikiReview: reviewFirst });
      setUrl("");
      return t("feedback.website", { count: links.length });
    });

  const importText = () =>
    run(async () => {
      if (!textTitle.trim() || !textBody.trim()) throw new Error(t("errors.missingText"));
      await saveManualText({ ...scopeArgs, title: textTitle.trim(), textContent: textBody, wikiReview: reviewFirst });
      setTextTitle("");
      setTextBody("");
      return t("feedback.text");
    });

  const importFiles = (fileList: FileList | null) =>
    run(async () => {
      const collected = collectPickedFiles(fileList);
      if (collected.length === 0) throw new Error(t("errors.missingFile"));
      for (const item of collected) {
        const verdict = validateUploadFile(item.file, "knowledgeDocument");
        if (!verdict.allowed) throw new Error(verdict.reason);
      }
      for (const item of collected) {
        const contentType = resolveUploadContentType(item.file);
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": contentType },
          body: item.file,
        });
        const { storageId } = (await result.json()) as { storageId: Id<"_storage"> };
        await saveDocument({
          ...scopeArgs,
          storageId,
          title: buildUploadTitle(item),
          format: contentType,
          ...(collected.length > 1 ? { deferIngestion: true } : {}),
          wikiReview: reviewFirst,
        });
      }
      if (collected.length > 1) await startKnowledgeFileQueue({});
      if (fileInputRef.current) fileInputRef.current.value = "";
      return t("feedback.files", { count: collected.length });
    });

  // The Obsidian round trip (living-wiki plan, phase 4): a vault's
  // markdown files, each through the SAME import road as everything
  // else — the Distiller learns them, review-first honoured, [[links]]
  // riding along in the text. Bounded; junk skipped and said so.
  const VAULT_MAX_FILES = 300;
  const importVault = (fileList: FileList | null) =>
    run(async () => {
      const picked = Array.from(fileList ?? []);
      if (picked.length === 0) throw new Error(t("errors.missingFile"));
      const markdownFiles: Array<{ name: string; text: string }> = [];
      let skipped = 0;
      for (const file of picked) {
        if (file.name.toLowerCase().endsWith(".zip")) {
          const { unzipSync, strFromU8 } = await import("fflate");
          const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
          for (const [path, bytes] of Object.entries(entries)) {
            if (path.endsWith("/")) continue;
            if (!path.toLowerCase().endsWith(".md")) {
              skipped += 1;
              continue;
            }
            markdownFiles.push({ name: path, text: strFromU8(bytes) });
          }
        } else if (file.name.toLowerCase().endsWith(".md")) {
          markdownFiles.push({ name: file.name, text: await file.text() });
        } else {
          skipped += 1;
        }
      }
      if (markdownFiles.length === 0) throw new Error(t("errors.noMarkdown"));
      const bounded = markdownFiles.slice(0, VAULT_MAX_FILES);
      for (const note of bounded) {
        const title = note.name.replace(/\.md$/i, "").split("/").pop() ?? note.name;
        const text = note.text.trim();
        if (!text) {
          skipped += 1;
          continue;
        }
        await saveManualText({
          ...scopeArgs,
          title,
          textContent: text.slice(0, 200_000),
          wikiReview: reviewFirst,
        });
      }
      if (vaultInputRef.current) vaultInputRef.current.value = "";
      return skipped > 0
        ? t("feedback.vaultSkipped", { count: bounded.length, skipped })
        : t("feedback.vault", { count: bounded.length });
    });

  const tabs = [
    { key: "website" as const, icon: Globe, label: t("tabs.website") },
    { key: "file" as const, icon: FileUp, label: t("tabs.file") },
    { key: "text" as const, icon: Type, label: t("tabs.text") },
    { key: "vault" as const, icon: FolderOpen, label: t("tabs.vault") },
  ];

  return (
    <div id="wiki-import" className="flex flex-col gap-4 rounded-[16px] border border-border-dim bg-card/40 p-5">
      <div className="flex items-center gap-2">
        {tabs.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-[12.5px] font-medium border transition-colors ${
              tab === key
                ? "bg-brand text-white border-brand"
                : "bg-background text-secondary border-border-dim hover:text-foreground"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === "website" && (
        <div className="flex items-center gap-2">
          <input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder={t("websitePlaceholder")}
            disabled={isBusy}
            className="flex-1 bg-background border border-border-dim rounded-[10px] px-4 py-3 text-[13px] text-foreground placeholder:text-muted/60 focus:outline-none focus:border-brand/50 transition-colors"
          />
          <AdminWriteButton
            onClick={() => void importWebsite()}
            disabled={isBusy || !url.trim()}
            className="flex items-center gap-2 px-4 py-3 rounded-[10px] bg-brand text-white text-[13px] font-medium disabled:opacity-40 transition-opacity whitespace-nowrap"
          >
            {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t("readIt")}
          </AdminWriteButton>
        </div>
      )}

      {tab === "file" && (
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            disabled={isBusy}
            onChange={(event) => void importFiles(event.target.files)}
            className="text-[13px] text-secondary file:mr-3 file:px-4 file:py-2.5 file:rounded-[10px] file:border-0 file:bg-brand file:text-white file:text-[12.5px] file:font-medium file:cursor-pointer"
          />
          {isBusy && <Loader2 className="w-4 h-4 animate-spin text-brand" />}
        </div>
      )}

      {tab === "text" && (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={textTitle}
            onChange={(event) => setTextTitle(event.target.value)}
            placeholder={t("textTitlePlaceholder")}
            disabled={isBusy}
            className="bg-background border border-border-dim rounded-[10px] px-4 py-2.5 text-[13px] text-foreground placeholder:text-muted/60 focus:outline-none focus:border-brand/50 transition-colors"
          />
          <textarea
            value={textBody}
            onChange={(event) => setTextBody(event.target.value)}
            placeholder={t("textBodyPlaceholder")}
            rows={4}
            disabled={isBusy}
            className="bg-background border border-border-dim rounded-[10px] px-4 py-3 text-[13px] text-foreground placeholder:text-muted/60 focus:outline-none focus:border-brand/50 transition-colors resize-y"
          />
          <AdminWriteButton
            onClick={() => void importText()}
            disabled={isBusy || !textTitle.trim() || !textBody.trim()}
            className="flex items-center gap-2 w-fit px-4 py-2.5 rounded-[10px] bg-brand text-white text-[13px] font-medium disabled:opacity-40 transition-opacity"
          >
            {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t("readIt")}
          </AdminWriteButton>
        </div>
      )}

      {tab === "vault" && (
        <div className="flex flex-col gap-2">
          <p className="text-[12.5px] text-secondary">{t("vaultHint")}</p>
          <input
            ref={vaultInputRef}
            type="file"
            multiple
            accept=".md,.zip"
            disabled={isBusy}
            onChange={(event) => void importVault(event.target.files)}
            className="text-[13px] text-secondary file:mr-3 file:px-4 file:py-2.5 file:rounded-[10px] file:border-0 file:bg-brand file:text-white file:text-[13px] file:font-medium file:cursor-pointer"
          />
          {isBusy && <Loader2 className="w-4 h-4 animate-spin text-brand" />}
        </div>
      )}

      <label className="flex items-center gap-2 text-[12.5px] text-secondary cursor-pointer w-fit">
        <input
          type="checkbox"
          checked={reviewFirst}
          onChange={(event) => setReviewFirst(event.target.checked)}
          className="accent-[var(--brand,#ff5a1f)]"
        />
        {t("reviewFirst")}
      </label>

      {feedback && <p className="text-[12.5px] text-secondary">{feedback}</p>}
      {error && (
        <p className="text-[12.5px] text-warning" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
