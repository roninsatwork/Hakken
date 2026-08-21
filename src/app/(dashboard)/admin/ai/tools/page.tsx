"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, usePaginatedQuery } from "convex/react";
import { Loader2, Plus, Trash2, Wrench, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/ui/atoms/Button";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { SearchBar } from "@/src/ui/components/screens/Table";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { useTranslations } from "next-intl";

// Catalogue keys, relative to `admin.aiTools.shelf` — the screen says the words.
const ROLE_LABEL_KEYS: Record<string, string> = {
  SUPER_ADMIN: "roles.superAdmin",
  ADMIN: "roles.admins",
  USER: "roles.anyone",
};

const EFFECT_LABEL_KEYS: Record<string, string> = {
  READ: "effects.read",
  WRITE: "effects.write",
  DESTRUCTIVE: "effects.destructive",
  EXTERNAL: "effects.external",
};

/**
 * The tool shelf (Anthony's choice of direction B, 2026-08-16).
 *
 * This screen used to be two long flat lists: connectors above, abilities
 * below, in two different vocabularies, with nothing saying which ability
 * came from which connection or what state anything was in. Now one shelf
 * on the left sorts everything by kind, and each kind shows its connections
 * — the inbox, the phone line — above the abilities they give an agent.
 */

type Group = { key: string; labelKey: string; blurbKey: string };

const GROUPS: Group[] = [
  { key: "EMAIL", labelKey: "groups.email", blurbKey: "groups.emailBlurb" },
  { key: "VOICE", labelKey: "groups.phone", blurbKey: "groups.phoneBlurb" },
  { key: "KNOWLEDGE", labelKey: "groups.knowledge", blurbKey: "groups.knowledgeBlurb" },
  { key: "PROFILE", labelKey: "groups.companyRecords", blurbKey: "groups.companyRecordsBlurb" },
  { key: "WORKFLOW", labelKey: "groups.work", blurbKey: "groups.workBlurb" },
  { key: "HTTP", labelKey: "groups.otherSystems", blurbKey: "groups.otherSystemsBlurb" },
  { key: "CUSTOM", labelKey: "groups.builtByYou", blurbKey: "groups.builtByYouBlurb" },
];

export default function ToolsPage() {
  const t = useTranslations("admin.aiTools.shelf");
  const { platformName } = useSystemSettings();
  const deleteToolMutation = useMutation(api.aiTools.deleteTool);
  const installConnector = useMutation(api.aiTools.installConnector);
  const marketplace = useQuery(api.aiTools.getConnectorMarketplace);
  const shelf = useQuery(api.aiTools.getToolShelf, {});

  const [group, setGroup] = useState<string>("EMAIL");
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteId, setDeleteId] = useState<Id<"aiTools"> | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Searching looks across every group — a name you half-remember should not
  // need you to guess which shelf it sits on.
  const term = searchTerm.trim();
  const { results: tools, status, loadMore } = usePaginatedQuery(
    api.aiTools.getPaginatedTools,
    { ...(term ? { searchTerm: term } : {}), ...(term ? {} : { category: group }) },
    { initialNumItems: TABLE_PAGE_SIZE },
  );

  const connections = (marketplace ?? []).filter((entry) =>
    term ? true : entry.category === group
  );
  const activeGroup = GROUPS.find((entry) => entry.key === group) ?? GROUPS[0];

  const handleAddConnector = async (key: string) => {
    if (addingKey) return;
    setAddingKey(key);
    setError("");
    try {
      await installConnector({ key });
    } catch {
      setError(t("addFailed"));
    } finally {
      setAddingKey(null);
    }
  };

  const handleDeleteTool = async (id: Id<"aiTools">) => {
    if (isDeleting) return;
    setIsDeleting(true);
    setError("");
    try {
      await deleteToolMutation({ id });
      setDeleteId(null);
    } catch {
      setError(t("removeFailed"));
    } finally {
      setIsDeleting(false);
    }
  };

  const describeConnection = (entry: (typeof connections)[number]) => {
    if (!entry.installation) return { label: t("states.notAdded"), tone: "bg-foreground/5 text-muted" };
    if (entry.installation.authConnectionStatus === "ERROR") {
      return { label: t("states.needsAttention"), tone: "bg-warning/15 text-warning" };
    }
    if (!entry.installation.isActive) {
      return { label: t("states.switchedOff"), tone: "bg-foreground/5 text-muted" };
    }
    if (entry.installation.authConnectionStatus === "NOT_CONNECTED") {
      return { label: t("states.needsSetup"), tone: "bg-warning/15 text-warning" };
    }
    return { label: t("states.working"), tone: "bg-info/15 text-info" };
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        icon={<Wrench className="h-6 w-6 text-brand" />}
        title={t("headerTitle")}
        description={t("headerDescription")}
        divider
        action={
          <Link
            href="/admin/ai/tools/new"
            className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90"
          >
            <Plus className="h-4 w-4" />
            {t("buildTool")}
          </Link>
        }
      />

      {error ? (
        <p className="rounded-[10px] border border-warning/25 bg-warning/10 px-4 py-3 text-[13px] text-warning">
          {error}
        </p>
      ) : null}

      <div className="max-w-xl">
        <SearchBar
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder={t("searchPlaceholder")}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[210px_1fr]">
        {/* The shelf. Counts come from the server, so a group says how much
            is in it before it is opened. */}
        <nav className="flex flex-col gap-1">
          {GROUPS.map((entry) => {
            const count = shelf?.counts?.[entry.key] ?? 0;
            const isActive = !term && entry.key === group;
            return (
              // Stays raw: a selected-state shelf row (fill and weight swap with selection) — matches no variant.
              <button
                key={entry.key}
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setGroup(entry.key);
                }}
                className={`flex items-center justify-between gap-3 rounded-[9px] px-3 py-2 text-left text-[13px] transition-colors ${
                  isActive
                    ? "bg-hover font-semibold text-foreground"
                    : "text-secondary hover:text-foreground"
                }`}
              >
                {t(entry.labelKey)}
                <span className="text-[12px] tabular-nums text-muted">{count}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex flex-col gap-5">
          {!term && (
            <p className="text-[13px] text-secondary">{t(activeGroup.blurbKey, { platformName })}</p>
          )}

          {/* The connections in this group: things in the real world, each
              saying plainly whether it is working. */}
          {connections.length > 0 && (
            <div className="flex flex-col gap-2">
              {connections.map((entry) => {
                const state = describeConnection(entry);
                return (
                  <div
                    key={entry.key}
                    className="flex flex-wrap items-center gap-3 rounded-[14px] border border-border-dim bg-card/40 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-foreground">{entry.name}</p>
                      <p className="text-[12.5px] text-secondary line-clamp-2">{entry.description}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${state.tone}`}>
                      {state.label}
                    </span>
                    {entry.installation ? (
                      <Link
                        href={`/admin/ai/tools/connectors/${entry.installation._id}`}
                        className="shrink-0 rounded-[8px] border border-border-dim px-3 py-1.5 text-[12.5px] font-medium text-foreground transition-colors hover:bg-hover"
                      >
                        {t("settings")}
                      </Link>
                    ) : (
                      <WriteButton
                        onClick={() => void handleAddConnector(entry.key)}
                        disabled={addingKey === entry.key}
                        className="shrink-0 rounded-[8px] bg-brand px-3 py-1.5 text-[12.5px] font-medium text-white transition-opacity disabled:opacity-40"
                      >
                        {addingKey === entry.key ? t("adding") : t("add")}
                      </WriteButton>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* The abilities themselves. */}
          <div className="flex flex-col gap-2">
            {status === "LoadingFirstPage" ? (
              <div className="flex items-center gap-2 rounded-[14px] border border-border-dim bg-card/40 px-4 py-6 text-[13px] text-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> {t("loading")}
              </div>
            ) : tools.length === 0 ? (
              <div className="rounded-[14px] border border-border-dim bg-card/40 px-4 py-8 text-center text-[13px] text-muted">
                {term ? t("noMatch") : t("emptyGroup")}
              </div>
            ) : (
              tools.map((tool) => (
                <div
                  key={tool._id}
                  className="flex flex-wrap items-center gap-3 rounded-[12px] border border-border-dim bg-card/40 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-[13.5px] font-semibold text-foreground">
                      {tool.name}
                      {tool.isActive === false && (
                        <span className="text-[11px] font-normal text-muted">{t("off")}</span>
                      )}
                    </p>
                    <p className="text-[12.5px] text-secondary line-clamp-2">{tool.description}</p>
                  </div>
                  <span className="shrink-0 text-[12px] text-secondary">
                    {EFFECT_LABEL_KEYS[tool.sideEffectLevel ?? "READ"] ? t(EFFECT_LABEL_KEYS[tool.sideEffectLevel ?? "READ"]) : tool.sideEffectLevel}
                  </span>
                  <span className="shrink-0 text-[12px] text-muted">
                    {ROLE_LABEL_KEYS[tool.requiredRole] ? t(ROLE_LABEL_KEYS[tool.requiredRole]) : tool.requiredRole}
                  </span>
                  {deleteId === tool._id ? (
                    <span className="inline-flex shrink-0 items-center gap-2">
                      <span className="text-[12px] text-secondary">{t("removeIt")}</span>
                      <Button
                        variant="icon"
                        onClick={() => setDeleteId(null)}
                        aria-label={t("keep")}
                        className="rounded-[8px] p-1.5 hover:bg-hover"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                      <WriteButton
                        type="button"
                        onClick={() => void handleDeleteTool(tool._id)}
                        disabled={isDeleting}
                        aria-label={t("remove")}
                        className="rounded-[8px] bg-rose-500 p-1.5 text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </WriteButton>
                    </span>
                  ) : (
                    <WriteButton
                      type="button"
                      onClick={() => setDeleteId(tool._id)}
                      aria-label={t("removeAria", { name: tool.name })}
                      className="shrink-0 rounded-[8px] p-1.5 text-rose-500/70 transition-colors hover:bg-rose-500/10 hover:text-rose-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </WriteButton>
                  )}
                </div>
              ))
            )}

            {status === "CanLoadMore" && (
              <Button
                variant="quiet"
                onClick={() => loadMore(TABLE_PAGE_SIZE)}
                className="self-start text-[12.5px] bg-transparent hover:bg-transparent"
              >
                {t("showMore")}
              </Button>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
