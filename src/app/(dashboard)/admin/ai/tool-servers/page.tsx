"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CircleCheck, DownloadCloud, Loader2, PlugZap, Power, Server, Trash2, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/ui/atoms/Button";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { ModalField, ModalFormActions } from "@/src/ui/components/screens/ModalForm";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { TABLE_PAGE_SIZE, paginateItems } from "@/src/ui/components/screens/pagination";
import { formatDateTime } from "@/src/lib/dates";

/**
 * Tool servers a workspace has connected.
 *
 * A tool server is an address that publishes its own list of tools. Connecting
 * one is how a workspace gains a capability without anyone writing an
 * integration for it — so this screen is the whole point at which that becomes
 * something an administrator can do rather than a developer.
 *
 * Four things happen here, in the order a person does them: connect a server,
 * ask it what it offers, add those tools to the library, and switch it on.
 * They are deliberately four steps rather than one button. Connecting a server
 * should not reach out to it, and asking what it offers should not arm it.
 *
 * State is said in words and carried by an icon as well as a colour, and the
 * colours are the platform's information/warning pair rather than green and
 * red — the same rule the Connections screen follows.
 */
export default function ToolServersPage() {
  const t = useTranslations("admin.toolServers");

  const servers = useQuery(api.mcpServers.listServers, {});
  const createServer = useMutation(api.mcpServers.createServer);
  const setServerStatus = useMutation(api.mcpServers.setServerStatus);
  const deleteServer = useMutation(api.mcpServers.deleteServer);
  const importTools = useMutation(api.mcpToolPromotion.importServerTools);
  const discover = useAction(api.mcpDiscovery.discoverServerTools);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", url: "", secretRef: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** The connect form's own error, shown inside that form. Row actions use `notice`. */
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<Id<"mcpServers"> | null>(null);
  /**
   * What just happened, in words.
   *
   * Checking a connection used to say nothing at all when it worked, and — worse
   * — nothing when it failed either: a server that will not answer is a normal
   * outcome the backend *returns* rather than throws, so the screen quietly
   * discarded the reason. Pressing a button and learning nothing is not a
   * neutral outcome; it teaches a person the button does not work.
   */
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  /**
   * The result of a connection check, shown as its own answer.
   *
   * A check is a question a person deliberately asked, and they are waiting for
   * the answer. A line at the top of the page is the right weight for "3 tools
   * added" and the wrong weight for this — it is easy to miss, easy to mistake
   * for something left over from the last thing, and it cannot show what the
   * server actually offers.
   */
  const [checked, setChecked] = useState<
    { serverId: Id<"mcpServers">; name: string; ok: boolean; message: string; toolCount: number } | null
  >(null);
  const [deleting, setDeleting] = useState<{ _id: Id<"mcpServers">; name: string } | null>(null);

  const checkedTools = useQuery(
    api.mcpDiscovery.listServerTools,
    checked?.ok ? { serverId: checked.serverId } : "skip",
  );

  const needle = search.trim().toLowerCase();
  const visible = (servers ?? []).filter((row) =>
    !needle || `${row.name} ${row.url}`.toLowerCase().includes(needle));
  const paged = paginateItems(visible, page, TABLE_PAGE_SIZE);

  /**
   * Run one row action and always say what came of it.
   *
   * `describe` turns whatever the backend returned into a sentence. An action
   * that returns `{ ok: false }` is reported as plainly as one that threw —
   * from a person's side those are the same event, and only one of them was
   * being shown.
   */
  const run = async <T,>(
    id: Id<"mcpServers">,
    work: () => Promise<T>,
    describe: (result: T) => { ok: boolean; text: string } | null,
  ) => {
    setBusyId(id);
    setNotice(null);
    setChecked(null);
    try {
      setNotice(describe(await work()));
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : t("errors.unknown") });
    } finally {
      setBusyId(null);
    }
  };

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.url.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError("");
    try {
      await createServer({
        name: form.name.trim(),
        url: form.url.trim(),
        // One box on screen: a credential reference, or nothing. Typing one
        // means the server needs it; leaving it empty means it does not.
        authMode: form.secretRef.trim() ? "SECRET_REF" : "NONE",
        ...(form.secretRef.trim() ? { secretRef: form.secretRef.trim() } : {}),
      });
      setForm({ name: "", url: "", secretRef: "" });
      setIsAddOpen(false);
      setNotice({ ok: true, text: t("notices.connected", { name: form.name.trim() }) });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.unknown"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full pb-12">
      <PageHeader
        icon={<Server className="w-5 h-5" />}
        title={t("title")}
        description={t("subtitle")}
        action={
          <Button variant="primary" onClick={() => { setIsAddOpen(true); setError(""); setNotice(null); }}>
            {t("buttons.connect")}
          </Button>
        }
      />

      <p className="text-[13px] text-muted max-w-[70ch]">{t("hint")}</p>

      {/* Said in words and carried by an icon, never by colour alone. */}
      {notice ? (
        <div
          role="status"
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-[13px] ${
            notice.ok ? "bg-info/10 text-info" : "bg-warning/10 text-warning"
          }`}
        >
          {notice.ok
            ? <CircleCheck className="w-4 h-4 mt-px shrink-0" />
            : <AlertTriangle className="w-4 h-4 mt-px shrink-0" />}
          <span className="flex-1">{notice.text}</span>
          <Button
            variant="icon"
            onClick={() => setNotice(null)}
            aria-label={t("buttons.dismiss")}
            title={t("buttons.dismiss")}
            className="opacity-60 hover:opacity-100"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ) : null}

      <DataTable
        rows={servers === undefined ? undefined : paged.items}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[900px]"
        search={{
          value: search,
          onChange: (value) => { setSearch(value); setPage(1); },
          placeholder: t("searchPlaceholder"),
        }}
        empty={{ icon: <Server className="w-5 h-5" />, label: t("empty") }}
        footer={{
          mode: "paged",
          page,
          totalPages: paged.totalPages,
          totalCount: paged.totalItems,
          pageSize: paged.pageSize,
          isLoading: servers === undefined,
          onPageChange: setPage,
          labels: { empty: t("empty") },
        }}
        columns={[
          {
            key: "server",
            header: t("columns.server"),
            cell: (row) => (
              <>
                <span className="text-[14px] text-foreground">{row.name}</span>
                <span className="block text-[11px] text-muted mt-0.5 font-mono">{row.url}</span>
              </>
            ),
          },
          {
            key: "state",
            header: t("columns.state"),
            className: "whitespace-nowrap",
            cell: (row) => {
              // Never colour alone: an icon and a word carry the same meaning,
              // and the pair is information/warning rather than green/red.
              const tone = row.status === "ERROR"
                ? "bg-warning/15 text-warning"
                : row.status === "CONNECTED"
                  ? "bg-info/15 text-info"
                  : "bg-foreground/5 text-muted";
              const Icon = row.status === "ERROR"
                ? AlertTriangle
                : row.status === "CONNECTED" ? CircleCheck : Power;
              return (
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${tone}`}>
                  <Icon className="w-3 h-3" />
                  {t(`state.${row.status}`)}
                </span>
              );
            },
          },
          {
            key: "tools",
            header: t("columns.tools"),
            className: "whitespace-nowrap",
            cell: (row) => (
              <span className="text-[13px] text-secondary">
                {row.discoveredToolCount === undefined
                  ? t("tools.unknown")
                  : t("tools.count", { count: row.discoveredToolCount })}
              </span>
            ),
          },
          {
            key: "checked",
            header: t("columns.checked"),
            className: "whitespace-nowrap",
            cell: (row) => (
              <>
                <span className="text-[13px] text-secondary">
                  {row.lastDiscoveryAt ? formatDateTime(row.lastDiscoveryAt) : t("never")}
                </span>
                {row.lastDiscoveryMessage ? (
                  <span className="block text-[11px] text-muted mt-0.5 max-w-[36ch] truncate">
                    {row.lastDiscoveryMessage}
                  </span>
                ) : null}
              </>
            ),
          },
          {
            key: "actions",
            header: "",
            className: "w-px whitespace-nowrap",
            cell: (row) => (
              <RowActions>
                {busyId === row._id ? (
                  <Loader2 className="w-4 h-4 animate-spin text-muted" aria-label={t("working")} />
                ) : (
                  <>
                    <RowIconButton
                      label={t("buttons.check")}
                      onClick={() => run(
                        row._id,
                        () => discover({ serverId: row._id }),
                        (result) => {
                          setChecked({
                            serverId: row._id,
                            name: row.name,
                            ok: result.ok,
                            message: result.message,
                            toolCount: result.toolCount,
                          });
                          // The modal is the answer. A banner as well would be
                          // the same news twice.
                          return null;
                        },
                      )}
                    >
                      <PlugZap className="w-4 h-4" />
                    </RowIconButton>
                    <RowIconButton
                      label={t("buttons.addTools")}
                      onClick={() => run(
                        row._id,
                        () => importTools({ serverId: row._id }),
                        (result) => ({
                          ok: true,
                          text: t("notices.toolsAdded", { name: row.name, count: result.created }),
                        }),
                      )}
                    >
                      <DownloadCloud className="w-4 h-4" />
                    </RowIconButton>
                    <RowIconButton
                      label={row.status === "CONNECTED" ? t("buttons.switchOff") : t("buttons.switchOn")}
                      onClick={() => run(
                        row._id,
                        () => setServerStatus({
                          id: row._id,
                          status: row.status === "CONNECTED" ? "DISABLED" : "CONNECTED",
                        }),
                        () => ({
                          ok: true,
                          text: t(row.status === "CONNECTED" ? "notices.switchedOff" : "notices.switchedOn",
                            { name: row.name }),
                        }),
                      )}
                    >
                      <Power className="w-4 h-4" />
                    </RowIconButton>
                    <RowIconButton
                      label={t("buttons.disconnect")}
                      tone="danger"
                      onClick={() => setDeleting({ _id: row._id, name: row.name })}
                    >
                      <Trash2 className="w-4 h-4" />
                    </RowIconButton>
                  </>
                )}
              </RowActions>
            ),
          },
        ]}
      />

      <SonaeModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title={t("modal.title")}
      >
        <div className="flex flex-col gap-2 mb-6">
          <p className="text-secondary text-[15px]">{t("modal.description")}</p>
          {error ? <p className="text-warning text-[13px] font-medium">{error}</p> : null}
        </div>
        <form onSubmit={handleAdd} className="flex flex-col gap-5">
          <ModalField
            label={t("modal.name")}
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={t("placeholders.name")}
          />
          <ModalField
            label={t("modal.url")}
            required
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder={t("placeholders.url")}
          />
          <ModalField
            label={t("modal.secretRef")}
            value={form.secretRef}
            onChange={(e) => setForm({ ...form, secretRef: e.target.value })}
            placeholder={t("placeholders.secretRef")}
          />
          <p className="text-[12px] text-muted">{t("modal.secretHint")}</p>

          <ModalFormActions
            cancelLabel={t("buttons.cancel")}
            submitLabel={isSubmitting ? t("buttons.connecting") : t("buttons.connect")}
            isSubmitting={isSubmitting}
            onCancel={() => setIsAddOpen(false)}
          />
        </form>
      </SonaeModal>

      {/*
        * The answer to "did that work".
        *
        * Deliberately a modal rather than a line at the top of the page: a
        * person pressed a button and is waiting. It says pass or fail in a
        * heading, gives the reason when it failed, and — when it worked — lists
        * what the server actually offers, because a count is not an answer to
        * whether the connection is worth having.
        */}
      <SonaeModal
        isOpen={!!checked}
        onClose={() => setChecked(null)}
        title={checked?.ok ? t("checked.passedTitle") : t("checked.failedTitle")}
      >
        <div className="flex flex-col gap-4">
          <div
            className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 ${
              checked?.ok ? "bg-info/10 text-info" : "bg-warning/10 text-warning"
            }`}
          >
            {checked?.ok
              ? <CircleCheck className="w-4 h-4 mt-0.5 shrink-0" />
              : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
            <div className="flex flex-col gap-1">
              <span className="text-[14px] font-medium">
                {checked?.ok
                  ? t("checked.passed", { name: checked?.name ?? "" })
                  : t("checked.failed", { name: checked?.name ?? "" })}
              </span>
              <span className="text-[13px] opacity-90">{checked?.message}</span>
            </div>
          </div>

          {checked?.ok ? (
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-medium text-secondary">
                {t("checked.offers", { count: checked?.toolCount ?? 0 })}
              </span>
              {checkedTools === undefined ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted" />
              ) : (
                <ul className="flex flex-col gap-2 max-h-[280px] overflow-y-auto">
                  {checkedTools.map((tool) => (
                    <li key={tool.name} className="flex flex-col gap-0.5 border-l-2 border-border-dim pl-3">
                      <span className="text-[13px] text-foreground font-mono">{tool.title || tool.name}</span>
                      <span className="text-[12px] text-muted">{tool.description}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[12px] text-muted">{t("checked.nextStep")}</p>
            </div>
          ) : (
            <p className="text-[13px] text-muted">{t("checked.whatToDo")}</p>
          )}

          <div className="flex justify-end">
            <Button variant="primary" onClick={() => setChecked(null)}>
              {t("buttons.close")}
            </Button>
          </div>
        </div>
      </SonaeModal>

      <ConfirmationModal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        title={t("modal.disconnectTitle")}
        cancelLabel={t("buttons.cancel")}
        confirmLabel={t("buttons.disconnect")}
        isSubmitting={busyId !== null}
        onConfirm={async () => {
          if (!deleting) return;
          await run(
            deleting._id,
            () => deleteServer({ id: deleting._id }),
            () => ({ ok: true, text: t("notices.disconnected", { name: deleting.name }) }),
          );
          setDeleting(null);
        }}
      >
        <p>{t("modal.disconnectConfirm", { name: deleting?.name ?? "" })}</p>
        <p className="text-[13px] text-muted">{t("modal.disconnectDetail")}</p>
      </ConfirmationModal>
    </div>
  );
}
