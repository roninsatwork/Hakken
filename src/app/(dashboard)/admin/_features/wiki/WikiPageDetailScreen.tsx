"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { FileText, History, Library, Link2, Loader2, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import HakkenModal from "@/src/ui/components/feedback/HakkenModal";
import { useCanWriteHere } from "@/src/ui/components/screens/AccessLevel";
import { Button } from "@/src/ui/components/screens/Button";
import { CompactList, type CompactListColumn } from "@/src/ui/components/screens/CompactList";
import { DetailTabs } from "@/src/ui/components/screens/DetailTabs";
import { FactsList } from "@/src/ui/components/screens/FactsList";
import { Field, TextAreaField } from "@/src/ui/components/screens/Field";
import { Notice } from "@/src/ui/components/screens/Notice";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { SaveError, SaveFeedback } from "@/src/ui/components/screens/SaveControls";
import { SectionLabel } from "@/src/ui/components/screens/SectionLabel";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { RowIconButton } from "@/src/ui/components/screens/Table";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { formatDate, formatDateTime } from "@/src/lib/dates";
import { WikiQuickSwitcher } from "./WikiQuickSwitcher";
import { WikiLocalGraph } from "./WikiLocalGraph";
import { WikiPageTags } from "./WikiPageTags";
import { useDescribeWikiSource } from "./wikiWords";

const WikiProse = dynamic(() => import("./WikiProse").then((module) => module.WikiProse));

const TABS = ["page", "sources", "history", "links"] as const;
type PageTab = (typeof TABS)[number];

/** Which tab the address asks for; anything else is the page itself. */
function tabOf(search: URLSearchParams | null): PageTab {
  const picked = search?.get("tab") ?? "";
  return (TABS as readonly string[]).includes(picked) ? (picked as PageTab) : "page";
}

const SHORT_DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
const DATE_AND_TIME: Intl.DateTimeFormatOptions = { ...SHORT_DATE, hour: "2-digit", minute: "2-digit" };

/** A date in a table: the tables' figure size, in the numbers' face. */
const TABLE_DATE = "whitespace-nowrap font-mono text-[12px] tabular-nums text-secondary";
/** A table's column of words, cut to one line with "…", whole on hover. */
const CUT = "w-full max-w-0";

/** A source note is titled by its web address; the scheme adds nothing a reader needs. */
const withoutScheme = (title: string) => title.replace(/^https?:\/\//, "");

type Revision = { revisionId: Id<"wikiPageRevisions">; content: string; source: string; createdAt: number };

/**
 * One page of the wiki, READ FIRST (Anthony's ruling, 2026-08-17: "an actual wiki I can click around"): the document
 * typeset with live links and hover peeks. Mounted at two heights like the list.
 *
 * It was about ten parts stacked down one long page. Since 2026-11-21 it is one page in tabs, as upstream (Sonae
 * `bca5240f` and `b4b13509`; wiki-sonae-catch-up-plan-2026-11-21.md, S5), each tab with its own address (`?tab=history`):
 * Page holds the words, the pinned facts and Pin a fact, with the page's facts, tags and related pages beside them on a
 * wide screen and under them below that. Sources lists what taught it, History every earlier version with Put back,
 * and Links what links here with the little map of where you're standing.
 *
 * A Knowledge article's page (`isKnowledgeArticle`) is changed only under Content, so it offers no edit, pin, tag or
 * Put back, and says where to change it. The server refuses all of them anyway (`utils/knowledgePageGuard.ts`,
 * `wikiCheckupPages.requireScopedPage`).
 */
export function WikiPageDetailScreen({
  pageId,
  companyId,
  basePath,
  waitingHref,
}: {
  pageId: Id<"wikiPages">;
  companyId?: Id<"companies">;
  basePath: string;
  /** Where the open questions are settled. Until the wiki's Waiting page has its own address (S6), the wiki itself. */
  waitingHref?: string;
}) {
  const t = useTranslations("aiPages.detail");
  const tPages = useTranslations("aiPages");
  const tKinds = useTranslations("aiPages.kinds");
  const { platformName } = useSystemSettings();
  const describeSource = useDescribeWikiSource();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = tabOf(searchParams);
  const pageHref = `${basePath}/${pageId}`;
  const canWrite = useCanWriteHere();

  // Two doors, one mounted: hooks must both be called, so the unused door
  // is skipped rather than conditionally omitted.
  const globalDetail = useQuery(api.wikiPages.getPageDetailForGlobal, companyId ? "skip" : { pageId });
  const companyDetail = useQuery(api.wikiPages.getPageDetailForCompany, companyId ? { companyId, pageId } : "skip");
  const detail = companyId ? companyDetail : globalDetail;
  const editGlobal = useMutation(api.wikiPages.editPageContentForGlobal);
  const editCompany = useMutation(api.wikiPages.editPageContentForCompany);
  const pinGlobal = useMutation(api.wikiPages.pinCorrectionForGlobal);
  const pinCompany = useMutation(api.wikiPages.pinCorrectionForCompany);
  const unpinGlobal = useMutation(api.wikiPages.unpinCorrectionForGlobal);
  const unpinCompany = useMutation(api.wikiPages.unpinCorrectionForCompany);
  const rereadCompany = useMutation(api.knowledge.rereadSourceForCompany);
  const rereadGlobal = useMutation(api.knowledge.rereadSourceForGlobal);
  const restoreCompany = useMutation(api.wikiCheckupPages.restoreRevisionForCompany);
  const restoreGlobal = useMutation(api.wikiCheckupPages.restoreRevisionForGlobal);
  const [rereadState, setRereadState] = useState<"idle" | "queued">("idle");

  const editContent = (content: string) =>
    companyId ? editCompany({ companyId, pageId, content }) : editGlobal({ pageId, content });
  const pin = (text: string) => (companyId ? pinCompany({ companyId, pageId, text }) : pinGlobal({ pageId, text }));
  const unpin = (pinnedAt: number) =>
    companyId ? unpinCompany({ companyId, pageId, pinnedAt }) : unpinGlobal({ pageId, pinnedAt });
  const restore = (revisionId: Id<"wikiPageRevisions">) =>
    companyId ? restoreCompany({ companyId, revisionId }) : restoreGlobal({ revisionId });

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [newPin, setNewPin] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success">("idle");
  const [shownRevisionId, setShownRevisionId] = useState<Id<"wikiPageRevisions"> | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Revision | null>(null);
  const action = useAdminAction({ scope: "admin-wiki-page" });
  const [errorMessage, setErrorMessage] = useState("");

  // The draft follows the page until the person starts typing.
  useEffect(() => {
    if (detail && draft === null) setDraft(detail.content);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once per load
  }, [detail]);

  const run = async (work: () => Promise<unknown>) => {
    setIsSaving(true);
    setErrorMessage("");
    setSaveStatus("idle");
    const outcome = await action.run(work, {
      key: "wiki-save",
      suppressErrorToast: true,
      fallbackMessage: t("errors.save"),
    });
    if (outcome.ok) {
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } else if (outcome.message) {
      setErrorMessage(outcome.message);
    }
    setIsSaving(false);
  };

  const back = { label: t("page.back"), href: basePath };

  if (detail === undefined) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-brand" aria-hidden="true" />
      </div>
    );
  }
  if (detail === null) {
    return (
      <div className="flex flex-col gap-6 pb-16">
        <DetailHeader back={back} title={t("notFound")} />
      </div>
    );
  }

  // A person may change the page here unless it is a Knowledge article's copy.
  const canChange = canWrite && !detail.isKnowledgeArticle;
  const documentSources = detail.sources.filter((source) => source.kind === "DOCUMENT").length;
  const conversationSources = detail.sources.length - documentSources;
  const shortDate = (at: number) => formatDate(at, { options: SHORT_DATE });
  const dateAndTime = (at: number) => formatDateTime(at, { options: DATE_AND_TIME });

  const tabs = [
    { key: "page" as const, label: t("page.tabs.page"), icon: FileText },
    { key: "sources" as const, label: t("page.tabs.sources"), icon: Library, count: detail.sources.length },
    { key: "history" as const, label: t("history.title"), icon: History, count: detail.revisions.length },
    { key: "links" as const, label: t("page.tabs.links"), icon: Link2, count: detail.backlinks.length },
  ].map((entry) => ({
    label: entry.label,
    icon: entry.icon,
    count: entry.count,
    href: entry.key === "page" ? pageHref : `${pageHref}?tab=${entry.key}`,
    matches: (_pathname: string, search: URLSearchParams) => tabOf(search) === entry.key,
  }));

  const toggleEditing = () => {
    setIsEditing((current) => !current);
    setDraft(detail.content);
    if (tab !== "page") router.push(pageHref);
  };

  const confirmRestore = async () => {
    if (!restoreTarget) return;
    const { revisionId } = restoreTarget;
    await run(() => restore(revisionId));
    setRestoreTarget(null);
  };

  const pinnedColumns: CompactListColumn<{ text: string; pinnedAt: number }>[] = [
    {
      key: "fact",
      header: t("page.factColumn"),
      className: CUT,
      cell: (correction) => (
        <span className="block truncate text-[13px] text-foreground" title={correction.text}>
          {correction.text}
        </span>
      ),
    },
    {
      key: "pinned",
      header: t("page.pinnedColumn"),
      className: "whitespace-nowrap",
      cell: (correction) => <span className={TABLE_DATE}>{shortDate(correction.pinnedAt)}</span>,
    },
    ...(canChange
      ? [
          {
            key: "unpin",
            align: "right" as const,
            className: "w-[1%] whitespace-nowrap",
            cell: (correction: { text: string; pinnedAt: number }) => (
              <RowIconButton
                label={t("pinned.remove")}
                onClick={() => {
                  if (!isSaving) void run(() => unpin(correction.pinnedAt));
                }}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </RowIconButton>
            ),
          },
        ]
      : []),
  ];

  const historyColumns: CompactListColumn<Revision>[] = [
    {
      key: "when",
      header: t("history.whenColumn"),
      className: "whitespace-nowrap",
      cell: (revision) => <span className={TABLE_DATE}>{dateAndTime(revision.createdAt)}</span>,
    },
    {
      key: "by",
      header: t("history.byColumn"),
      className: "whitespace-nowrap",
      cell: (revision) => <span className="text-[13px] text-secondary">{describeSource(revision.source)}</span>,
    },
    {
      key: "before",
      header: <span title={t("history.beforeHint")}>{t("history.beforeColumn")}</span>,
      className: CUT,
      cell: (revision) => (
        <span className="block truncate text-[13px] text-foreground">{revision.content.replace(/\s+/g, " ").slice(0, 240)}</span>
      ),
    },
    {
      key: "show",
      align: "right",
      className: "w-[1%] whitespace-nowrap",
      cell: (revision) => {
        const isShown = shownRevisionId === revision.revisionId;
        return (
          <Button
            variant="quiet"
            aria-pressed={isShown}
            aria-label={t("history.showRow", { date: dateAndTime(revision.createdAt) })}
            onClick={() => setShownRevisionId(isShown ? null : revision.revisionId)}
          >
            {isShown ? t("history.hide") : t("history.show")}
          </Button>
        );
      },
    },
    ...(canChange
      ? [
          {
            key: "restore",
            align: "right" as const,
            className: "w-[1%] whitespace-nowrap",
            // Undo: every change, the check-up's fixes included, can be put back.
            cell: (revision: Revision) => (
              <Button
                variant="quiet"
                disabled={isSaving}
                aria-label={t("history.restoreRow", { date: dateAndTime(revision.createdAt) })}
                onClick={() => setRestoreTarget(revision)}
              >
                {t("history.restore")}
              </Button>
            ),
          },
        ]
      : []),
  ];

  const shownRevision = detail.revisions.find((revision) => revision.revisionId === shownRevisionId) ?? null;

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 pb-16">
      <WikiQuickSwitcher companyId={companyId} basePath={basePath} />
      <DetailHeader
        back={back}
        // A source note is titled by its web address, so it takes the smaller title, as a page's screen in Google
        // Analytics does.
        size={detail.kind === "SOURCE" ? "small" : "standard"}
        title={<span className="min-w-0 wrap-anywhere">{detail.title}</span>}
        description={t("read.meta", {
          documents: documentSources,
          conversations: conversationSources,
          source: describeSource(detail.lastRewriteSource),
          date: shortDate(detail.updatedAt),
        })}
        pills={
          detail.openQuestionCount > 0 ? (
            <Link href={waitingHref ?? basePath} className="hover:opacity-80">
              <StatusLabel tone="warning" size="md">
                {t("health.openQuestions", { count: detail.openQuestionCount })}
              </StatusLabel>
            </Link>
          ) : undefined
        }
        action={
          canWrite ? (
            // Wraps under the title when the window is narrow, rather than squashing it.
            <div className="flex flex-wrap items-center gap-2">
              {detail.kind === "SOURCE" ? (
                <Button
                  variant="outline"
                  disabled={isSaving || rereadState === "queued"}
                  onClick={() =>
                    void run(async () => {
                      if (companyId) await rereadCompany({ companyId, pageId });
                      else await rereadGlobal({ pageId });
                      setRereadState("queued");
                    })
                  }
                  className="whitespace-nowrap disabled:opacity-50"
                >
                  {rereadState === "queued" ? t("read.rereadQueued") : t("read.reread")}
                </Button>
              ) : null}
              {canChange ? (
                <Button variant="outline" className="whitespace-nowrap" onClick={toggleEditing}>
                  {isEditing ? t("read.reading") : t("read.edit")}
                </Button>
              ) : null}
            </div>
          ) : undefined
        }
      />

      <DetailTabs tabs={tabs} rootHref={pageHref} />

      {detail.isKnowledgeArticle ? <Notice>{t("page.knowledgeArticle")}</Notice> : null}

      <SaveFeedback
        status={saveStatus}
        successTitle={t("success.title")}
        successMessage={t("success.message")}
        errorTitle={t("errors.saveTitle")}
        errorMessage=""
      />
      <SaveError>{errorMessage}</SaveError>

      {tab === "page" ? (
        <div className="grid min-w-0 gap-10 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
          <article className="flex min-w-0 flex-col gap-8">
            {isEditing && canChange ? (
              <section className="flex flex-col gap-3">
                <TextAreaField
                  label={t("body.title")}
                  hint={t("body.hint", { platformName })}
                  value={draft ?? ""}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={14}
                  className="min-h-[320px] resize-y leading-relaxed"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="brand"
                    onClick={() =>
                      void run(async () => {
                        await editContent(draft ?? "");
                        setIsEditing(false);
                      })
                    }
                    disabled={isSaving || draft === null || draft.trim() === detail.content}
                  >
                    {isSaving ? t("body.saving") : t("body.save")}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setDraft(detail.content);
                      setIsEditing(false);
                    }}
                  >
                    {t("body.discard")}
                  </Button>
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

            {/* Pinned facts: the AI always sticks to them. */}
            <section className="flex flex-col gap-3 border-t border-border-dim pt-6">
              <SectionLabel>{t("pinned.title")}</SectionLabel>
              <p className="text-[13px] leading-relaxed text-secondary">{t("pinned.hint")}</p>
              <CompactList
                rows={detail.pinnedCorrections}
                rowKey={(correction) => String(correction.pinnedAt)}
                empty={t("pinned.none")}
                columns={pinnedColumns}
              />
              {canChange ? (
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-0 flex-[1_1_280px]">
                    <Field
                      label={t("read.foldPin")}
                      value={newPin}
                      onChange={(event) => setNewPin(event.target.value)}
                      placeholder={t("pinned.placeholder", { platformName })}
                    />
                  </div>
                  <Button
                    variant="outline"
                    className="whitespace-nowrap"
                    onClick={() =>
                      void run(async () => {
                        await pin(newPin);
                        setNewPin("");
                      })
                    }
                    disabled={isSaving || !newPin.trim()}
                  >
                    {t("pinned.add")}
                  </Button>
                </div>
              ) : null}
            </section>
          </article>

          {/* Beside the words on a wide screen, under them below that. */}
          <aside className="flex min-w-0 flex-col gap-8">
            <FactsList
              columns={2}
              className="lg:grid-cols-1"
              facts={[
                { label: tPages("kindFilter.label"), value: tKinds(detail.kind) },
                {
                  label: t("page.facts.verified"),
                  value: detail.lastVerifiedAt ? shortDate(detail.lastVerifiedAt) : t("health.neverVerified"),
                },
                {
                  label: tPages("columns.used"),
                  value: detail.usageCount > 0 ? tPages("used.count", { count: detail.usageCount }) : t("health.neverUsed"),
                },
                ...(detail.lastUsedAt ? [{ label: t("page.facts.lastUsed"), value: shortDate(detail.lastUsedAt) }] : []),
              ]}
            />
            <section className="flex flex-col gap-3">
              <SectionLabel>{t("tags.label")}</SectionLabel>
              <WikiPageTags companyId={companyId} pageId={pageId} tags={detail.tags} editable={!detail.isKnowledgeArticle} />
            </section>
            <section className="flex flex-col gap-3">
              <SectionLabel>{t("read.related")}</SectionLabel>
              {detail.resolvedLinks.length === 0 ? (
                <p className="text-[13px] text-secondary">{t("page.noRelated")}</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {detail.resolvedLinks.map((link) => {
                    // Source notes are keyed by document id; the link wears the readable title instead.
                    const name = link.key.startsWith("SOURCE:") ? withoutScheme(link.title) : link.slug;
                    return (
                      <li key={link.key} className="min-w-0">
                        <Link href={`${basePath}/${link.pageId}`} title={name} className="block truncate text-[13px] text-brand hover:underline">
                          {name}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </aside>
        </div>
      ) : null}

      {tab === "sources" ? (
        <section className="flex flex-col gap-3">
          <p className="text-[13px] leading-relaxed text-secondary">{t("sourcesPanel.hint")}</p>
          <CompactList
            rows={detail.sources}
            rowKey={(source) => `${source.kind}:${source.ref}`}
            empty={t("sourcesPanel.none")}
            columns={[
              {
                key: "source",
                header: t("page.sourceColumn"),
                className: CUT,
                cell: (source) => (
                  <span className="block truncate text-[13px] text-foreground" title={source.label}>
                    {source.label}
                  </span>
                ),
              },
              {
                key: "added",
                header: t("page.addedColumn"),
                className: "whitespace-nowrap",
                cell: (source) => <span className={TABLE_DATE}>{shortDate(source.addedAt)}</span>,
              },
              {
                key: "open",
                align: "right",
                className: "w-[1%] whitespace-nowrap",
                cell: (source) => {
                  const href =
                    source.kind === "PHONE_CALL"
                      ? `/app/calls/${source.ref}`
                      : source.kind === "DOCUMENT" && companyId
                        ? `/admin/companies/${companyId}/ai/knowledge/${source.ref}`
                        : null;
                  return href ? (
                    <Link href={href} className="text-[13px] text-brand hover:underline">
                      {t("sourcesPanel.open")}
                    </Link>
                  ) : null;
                },
              },
            ]}
          />
        </section>
      ) : null}

      {tab === "history" ? (
        <section className="flex flex-col gap-3">
          <p className="text-[13px] leading-relaxed text-secondary">{t("history.hint")}</p>
          <CompactList rows={detail.revisions} rowKey={(revision) => revision.revisionId} empty={t("history.none")} columns={historyColumns} />
          {shownRevision ? (
            <div className="flex flex-col gap-3 border-t border-border-dim pt-6">
              <h3 className="text-[13px] font-semibold text-foreground">
                {t("history.shown", { date: dateAndTime(shownRevision.createdAt) })}
              </h3>
              <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground/90">{shownRevision.content}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "links" ? (
        <section className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <SectionLabel>{t("page.linksHere")}</SectionLabel>
            <CompactList
              rows={detail.backlinks}
              rowKey={(backlink) => backlink.pageId}
              empty={t("page.noLinks")}
              columns={[
                {
                  key: "page",
                  header: t("read.backlinkPageColumn"),
                  className: "w-[30%] max-w-0",
                  cell: (backlink) => {
                    const name = backlink.kind === "SOURCE" ? withoutScheme(backlink.title) : backlink.subjectKey;
                    return (
                      <Link href={`${basePath}/${backlink.pageId}`} title={name} className="block truncate text-[13px] text-brand hover:underline">
                        {name}
                      </Link>
                    );
                  },
                },
                {
                  key: "quote",
                  header: t("read.backlinkQuoteColumn"),
                  className: "max-w-0",
                  cell: (backlink) => (
                    <span className="block truncate text-[13px] text-secondary" title={backlink.quote}>
                      {backlink.quote}
                    </span>
                  ),
                },
              ]}
            />
          </div>
          {detail.resolvedLinks.length > 0 || detail.backlinks.length > 0 ? (
            <WikiLocalGraph
              title={detail.title}
              kind={detail.kind}
              resolvedLinks={detail.resolvedLinks}
              backlinks={detail.backlinks}
              basePath={basePath}
            />
          ) : null}
        </section>
      ) : null}

      <HakkenModal
        isOpen={restoreTarget !== null}
        onClose={() => {
          if (!isSaving) setRestoreTarget(null);
        }}
        title={t("history.restoreTitle")}
        size="sm"
      >
        <div className="flex w-full flex-col gap-6 pt-4">
          <p className="text-[13px] leading-relaxed text-secondary">
            {restoreTarget ? t("history.restoreConfirm", { date: dateAndTime(restoreTarget.createdAt) }) : null}
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setRestoreTarget(null)} disabled={isSaving}>
              {tPages("delete.cancel")}
            </Button>
            <Button variant="primary" onClick={() => void confirmRestore()} disabled={isSaving}>
              {t("history.restore")}
            </Button>
          </div>
        </div>
      </HakkenModal>
    </div>
  );
}
