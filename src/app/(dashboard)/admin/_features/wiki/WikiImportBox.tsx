"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { useAction, useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { FileUp, FolderOpen, Globe, Loader2, Type } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { buttonClasses } from "@/src/ui/components/screens/Button";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DetailTabs } from "@/src/ui/components/screens/DetailTabs";
import { DropArea } from "@/src/ui/components/screens/DropArea";
import { Field, TextAreaField } from "@/src/ui/components/screens/Field";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";

const KINDS = ["website", "file", "text", "vault"] as const;
type ImportKind = (typeof KINDS)[number];
const KIND_ICONS = { website: Globe, file: FileUp, text: Type, vault: FolderOpen } as const;

/**
 * The one import (wiki-replaces-knowledge plan, screen 1): a website, a file,
 * some text or a whole vault goes in here, and what comes back is wiki pages.
 * The distiller runs off the same ingestion this box triggers, so there is
 * nothing to run twice and no second button anywhere.
 *
 * It is the Add to the wiki page's body (wiki-sonae-catch-up-plan-2026-11-21.md,
 * S6, from the upstream framework's `be63693c`). The four ways in are tabs with
 * their own address (`?kind=file`), each keeping its own boxes, and the tick box
 * to review first shows under all four. Files and vaults go in through the
 * shared `DropArea` the moment they're dropped or chosen; a website and text go
 * in with Read it, the page's one orange action.
 */
export function WikiImportBox({ companyId }: { companyId?: Id<"companies"> }) {
  const t = useTranslations("aiPages.import");
  const tAdd = useTranslations("aiPages.addScreen");
  const { platformName } = useSystemSettings();
  const pathname = usePathname() || "";
  const picked = useSearchParams()?.get("kind");
  const tab: ImportKind = (KINDS as readonly string[]).includes(picked ?? "") ? (picked as ImportKind) : "website";

  const mapWebsite = useAction(api.knowledgeActions.mapWebsite);
  const queueWebsiteUrls = useMutation(api.knowledge.queueWebsiteUrls);
  const saveManualText = useMutation(api.knowledge.saveManualText);
  const generateUploadUrl = useMutation(api.knowledge.generateUploadUrl);
  const saveDocument = useMutation(api.knowledge.saveDocument);
  const startKnowledgeFileQueue = useMutation(api.knowledge.startKnowledgeFileQueue);

  const scopeArgs = companyId ? { companyId } : {};
  // The Reviewer's checkpoint (wiki-agents plan, phase 4): tick it and the
  // wiki writes nothing from this import until you approve the claims.
  // It starts unticked on every shelf, the platform one included: imports go
  // straight into the wiki (Anthony, 2026-11-09, in Sonae; brought over on
  // 2026-11-21, wiki-sonae-catch-up-plan-2026-11-21.md, 0.4).
  const [reviewFirst, setReviewFirst] = useState(false);
  const [url, setUrl] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const [textBody, setTextBody] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const action = useAdminAction({ scope: "admin-wiki-import" });
  const [error, setError] = useState("");

  const run = async (work: () => Promise<string>) => {
    setIsBusy(true);
    setError("");
    setFeedback("");
    const outcome = await action.run(work, {
      key: "wiki-import",
      suppressErrorToast: true,
      fallbackMessage: t("errors.generic"),
    });
    if (outcome.ok) setFeedback(outcome.data);
    else if (outcome.message) setError(outcome.message);
    setIsBusy(false);
  };

  const importWebsite = () =>
    run(async () => {
      const cleaned = url.trim();
      if (!cleaned) throw new Error(t("errors.missingUrl"));
      const links: string[] = await mapWebsite({ url: cleaned });
      await queueWebsiteUrls({ ...scopeArgs, urls: links, wikiReview: reviewFirst });
      setUrl("");
      return t("feedback.website", { count: links.length, platformName });
    });

  const importText = () =>
    run(async () => {
      if (!textTitle.trim() || !textBody.trim()) throw new Error(t("errors.missingText"));
      await saveManualText({ ...scopeArgs, title: textTitle.trim(), textContent: textBody, wikiReview: reviewFirst });
      setTextTitle("");
      setTextBody("");
      return t("feedback.text", { platformName });
    });

  const importFiles = (fileList: readonly File[]) =>
    run(async () => {
      const [{ resolveUploadContentType, validateUploadFile }, { buildUploadTitle, collectPickedFiles }] =
        await Promise.all([
          import("@/src/lib/constants/uploads"),
          import("@/src/app/(dashboard)/admin/_features/knowledge/knowledgeUploadUtils"),
        ]);
      const collected = collectPickedFiles(fileList);
      if (collected.length === 0) throw new Error(t("errors.missingFile"));
      for (const item of collected) {
        const verdict = validateUploadFile(item.file, "knowledgeDocument");
        if (!verdict.allowed) throw new Error(verdict.reason);
      }
      for (const item of collected) {
        const contentType = resolveUploadContentType(item.file);
        const uploadUrl = await generateUploadUrl({ sizeBytes: item.file.size, contentType: contentType });
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
      return t("feedback.files", { count: collected.length, platformName });
    });

  // The Obsidian round trip (living-wiki plan, phase 4): a vault's markdown
  // files, each through the SAME import road as everything else. The
  // Distiller learns them, review-first honoured, [[links]] riding along in
  // the text. At most 300 notes from one vault; anything that isn't markdown
  // is skipped, and the feedback says how many.
  const VAULT_MAX_FILES = 300;
  const importVault = (picked: readonly File[]) =>
    run(async () => {
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
      return skipped > 0
        ? t("feedback.vaultSkipped", { count: bounded.length, skipped })
        : t("feedback.vault", { count: bounded.length });
    });

  const tabs = KINDS.map((kind) => ({
    label: t(`tabs.${kind}`),
    icon: KIND_ICONS[kind],
    href: kind === "website" ? pathname : `${pathname}?kind=${kind}`,
    matches: () => tab === kind,
  }));

  const spinner = isBusy ? <Loader2 className="h-4 w-4 animate-spin text-secondary" aria-hidden="true" /> : null;

  return (
    <div id="wiki-import" className="flex min-w-0 flex-col gap-5">
      <DetailTabs tabs={tabs} rootHref={pathname} />

      {tab === "website" && (
        <Field
          label={tAdd("websiteLabel")}
          hint={tAdd("websiteHint")}
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={tAdd("websitePlaceholder")}
          disabled={isBusy}
        />
      )}

      {tab === "file" && (
        <DropArea
          layout="row"
          title={tAdd("fileHint")}
          chooseFilesLabel={tAdd("fileLabel")}
          multiple
          disabled={isBusy}
          leading={spinner}
          onFiles={(files) => void importFiles(files)}
        />
      )}

      {tab === "text" && (
        <div className="flex flex-col gap-4">
          <Field
            label={tAdd("textTitleLabel")}
            value={textTitle}
            onChange={(event) => setTextTitle(event.target.value)}
            placeholder={t("textTitlePlaceholder")}
            disabled={isBusy}
          />
          <TextAreaField
            label={tAdd("textBodyLabel")}
            value={textBody}
            onChange={(event) => setTextBody(event.target.value)}
            placeholder={t("textBodyPlaceholder")}
            rows={6}
            disabled={isBusy}
            className="min-h-[160px] resize-y"
          />
        </div>
      )}

      {tab === "vault" && (
        <DropArea
          layout="row"
          title={t("vaultHint")}
          chooseFilesLabel={tAdd("vaultLabel")}
          accept=".md,.zip"
          multiple
          disabled={isBusy}
          leading={spinner}
          onFiles={(files) => void importVault(files)}
        />
      )}

      <div className="flex flex-col gap-1">
        <Checkbox label={t("reviewFirst")} checked={reviewFirst} onChange={setReviewFirst} disabled={isBusy} />
        <p className="pl-5 text-[13px] leading-relaxed text-secondary">{tAdd("reviewFirstHint")}</p>
      </div>

      {feedback ? (
        <p className="text-[13px] text-secondary" aria-live="polite">
          {feedback}
        </p>
      ) : null}
      {error ? (
        <p className="text-[13px] text-warning" role="alert">
          {error}
        </p>
      ) : null}

      {tab === "website" || tab === "text" ? (
        <div className="flex border-t border-border-dim pt-4">
          <WriteButton
            type="button"
            onClick={() => void (tab === "website" ? importWebsite() : importText())}
            disabled={isBusy || (tab === "website" ? !url.trim() : !textTitle.trim() || !textBody.trim())}
            className={buttonClasses("brand", "inline-flex w-fit items-center gap-2")}
          >
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {t("readIt")}
          </WriteButton>
        </div>
      ) : null}
    </div>
  );
}
