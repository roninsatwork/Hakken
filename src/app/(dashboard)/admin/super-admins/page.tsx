"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import Image from "next/image";
import type { FormEvent } from "react";
import { 
  Users, 
  Plus, 
  ShieldCheck,
  User,
  Trash2,
  Edit2,
  Loader2
} from "lucide-react";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { Button } from "@/src/ui/atoms/Button";
import Link from "next/link";
import type { Doc } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { ModalField, ModalFormField } from "@/src/ui/components/screens/ModalForm";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { DataTable, type DataTableColumn } from "@/src/ui/components/screens/DataTable";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { usePagedRows } from "@/src/hooks/usePagedRows";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { useTranslations } from "next-intl";

type SuperAdminFormData = {
  name: string;
  email: string;
  role: "SUPER_ADMIN";
  image: string;
};

/**
 * The directory lists two things in one table: people, and invitations nobody
 * has accepted yet. They read differently and only the person opens, so the row
 * carries which it is and each column decides what to draw.
 */
type DirectoryRow =
  | { kind: "invite"; invite: Doc<"invitations"> }
  | { kind: "user"; user: Doc<"users"> };

function buildDirectoryColumns(actions: {
  onEdit: (user: Doc<"users">) => void;
  onDelete: (user: Doc<"users">) => void;
  onRevoke: (invite: Doc<"invitations">) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}): DataTableColumn<DirectoryRow>[] {
  const { t } = actions;
  return [
    {
      key: "administrator",
      header: t("columnAdmin"),
      cell: (row) =>
        row.kind === "invite" ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-black border border-brand/20 border-dashed flex items-center justify-center">
              <span className="text-[9px] font-mono text-brand/50 uppercase tracking-widest">PND</span>
            </div>
            <div>
              <span className="font-medium text-[13px] text-foreground/70 block leading-tight">
                {t("pendingInvitation")}
              </span>
              <span className="text-[12px] text-secondary">{row.invite.email}</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Image
              src={
                row.user.image ||
                `https://api.dicebear.com/7.x/notionists/svg?seed=${row.user.name ?? row.user.email ?? row.user._id}`
              }
              alt={row.user.name ?? row.user.email ?? "Super admin"}
              width={32}
              height={32}
              unoptimized
              className="w-8 h-8 rounded-full bg-card border border-border-dim"
            />
            <div>
              <span className="font-medium text-[13px] text-foreground group-hover:text-brand transition-colors block leading-tight">
                {row.user.name}
              </span>
              <span className="text-[12px] text-secondary">{row.user.email}</span>
            </div>
          </div>
        ),
    },
    {
      key: "joined",
      header: t("columnJoined"),
      cell: (row) =>
        row.kind === "invite" ? (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-brand/10 border border-brand/20 w-fit">
            <span className="text-[10px] font-mono tracking-widest text-brand uppercase">
              {t("pendingRole", { role: row.invite.role })}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-foreground/5 border border-border-dim w-fit">
            {row.user.role === "ADMIN" ? (
              <ShieldCheck className="w-3 h-3 text-brand" />
            ) : (
              <User className="w-3 h-3 text-foreground/70" />
            )}
            <span className="text-[10px] font-mono tracking-widest text-foreground/80 uppercase">
              {row.user.role || "USER"}
            </span>
          </div>
        ),
    },
    {
      key: "actions",
      header: t("columnActions"),
      align: "right",
      cell: (row) =>
        row.kind === "invite" ? (
          <RowActions>
            <span className="text-[11px] font-mono text-brand/50 uppercase tracking-widest mr-2">
              {t("awaitingLogin")}
            </span>
            <RowIconButton
              label={t("revokeInvitation")}
              tone="danger"
              onClick={() => actions.onRevoke(row.invite)}
            >
              <Trash2 className="w-4 h-4" />
            </RowIconButton>
          </RowActions>
        ) : (
          <RowActions>
            <RowIconButton label={t("editAdmin")} onClick={() => actions.onEdit(row.user)}>
              <Edit2 className="w-4 h-4" />
            </RowIconButton>
            <RowIconButton
              label={t("deleteAdmin")}
              tone="danger"
              onClick={() => actions.onDelete(row.user)}
            >
              <Trash2 className="w-4 h-4" />
            </RowIconButton>
          </RowActions>
        ),
    },
  ];
}


export default function ManageSuperAdminsPage() {
  const t = useTranslations("admin.superAdmins");
  const router = useRouter();
  const currentUser = useQuery(api.users.getMe);
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";
  
  const { results: paginatedUsers, status, loadMore } = usePaginatedQuery(
    api.users.getSuperAdmins,
    isSuperAdmin ? {} : "skip",
    { initialNumItems: TABLE_PAGE_SIZE }
  );

  const pendingInvites = useQuery(api.invites.getPendingInvites, isSuperAdmin ? {} : "skip") || [];
  const deleteUser = useMutation(api.users.deleteUser);
  const revokeInvite = useMutation(api.invites.revokeInvite);
  const updateUser = useMutation(api.users.updateUser);

  const [searchTerm, setSearchTerm] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Doc<"users"> | null>(null);
  const [deletingUser, setDeletingUser] = useState<Doc<"users"> | null>(null);
  const [deletingInvite, setDeletingInvite] = useState<Doc<"invitations"> | null>(null);

  const [formData, setFormData] = useState<SuperAdminFormData>({ name: "", email: "", role: "SUPER_ADMIN", image: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const filteredUsers = paginatedUsers.filter((u) =>
    (u.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.email || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredInvites = pendingInvites.filter((inv) =>
    inv.role === "SUPER_ADMIN" &&
    (inv.email || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSearch = (v: string) => {
    setSearchTerm(v);
  };

  // Invitations first, then people — the order the hand-written table had.
  const directoryRows: DirectoryRow[] = [
    ...filteredInvites.map((invite) => ({ kind: "invite" as const, invite })),
    ...filteredUsers.map((user) => ({ kind: "user" as const, user })),
  ];

  // Undefined while the first page is still coming, so the table shows a
  // spinner. The hand-written table had no such distinction and told the reader
  // "no users found" during every load, which is a different and wrong claim.
  const isLoadingFirstPage = status === "LoadingFirstPage";

  const paged = usePagedRows(directoryRows, {
    canLoadMore: status === "CanLoadMore",
    loadMore,
    resetKey: searchTerm,
  });

  if (currentUser === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return <div className="p-8 text-secondary">{t("unauthorized")}</div>;
  }

  const handleOpenEdit = (user: Doc<"users">) => {
    setFormData({ name: user.name ?? "", email: user.email ?? "", role: "SUPER_ADMIN", image: user.image || "" });
    setEditingUser(user);
    setSubmitError("");
    setIsAddModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setIsSubmitting(true);
    try {
      await updateUser({ id: editingUser._id, ...formData, role: "SUPER_ADMIN", companyId: undefined });
      setIsAddModalOpen(false);
    } catch (err: unknown) {
      setSubmitError(getErrorMessage(err, t("opFailed")));
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (deletingUser) {
      setIsSubmitting(true);
      try {
        await deleteUser({ id: deletingUser._id });
        setDeletingUser(null);
      } catch (err: unknown) {
        setSubmitError(getErrorMessage(err, t("deleteFailed")));
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const confirmRevoke = async () => {
    if (deletingInvite) {
      setIsSubmitting(true);
      try {
        await revokeInvite({ id: deletingInvite._id });
        setDeletingInvite(null);
      } catch (err: unknown) {
        setSubmitError(getErrorMessage(err, t("revokeFailed")));
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Users className="w-6 h-6 text-brand" />
            {t("title")}
          </h1>
          <p className="text-[13px] text-secondary mt-1">{t("subtitle")}</p>
        </div>
        
        <Link 
          href="/admin/super-admins/invite"
          className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-[13px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10"
        >
          <Plus className="w-4 h-4" />
          <span>{t("inviteUser")}</span>
        </Link>
      </div>

      <DataTable<DirectoryRow>
        rows={isLoadingFirstPage ? undefined : paged.pageRows}
        rowKey={(row) => (row.kind === "invite" ? `inv-${row.invite._id}` : `user-${row.user._id}`)}
        columns={buildDirectoryColumns({ onEdit: handleOpenEdit, onDelete: setDeletingUser, onRevoke: setDeletingInvite, t })}
        search={{
          value: searchTerm,
          onChange: handleSearch,
          placeholder: t("searchPlaceholder"),
        }}
        onRowClick={(row) => {
          if (row.kind === "user") router.push(`/admin/users/${row.user._id}`);
        }}
        rowClickable={(row) => row.kind === "user"}
        rowClassName={(row) =>
          row.kind === "invite" ? "bg-brand/[0.03] hover:bg-brand/[0.05] opacity-80" : ""
        }
        empty={{
          icon: <Users className="w-8 h-8 text-muted/30" />,
          label: t("empty"),
        }}
        footer={{
          mode: "paged",
          page: paged.page,
          totalPages: paged.totalPages,
          totalCount: paged.loadedCount,
          pageSize: paged.pageSize,
          isLoading: status === "LoadingMore",
          onPageChange: paged.goToPage,
          // Short, because the empty row above already says it in full — the
          // reference screens keep the footer to a count, not a sentence.
          labels: { empty: t("footerEmpty") },
        }}
      />


      {/* Add/Edit Modal */}
      <SonaeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={editingUser ? t("editTitle") : t("inviteTitle")}
      >
        <div className="flex flex-col gap-2 mb-6">
           <p className="text-secondary text-[15px]">{editingUser ? t("editSubtitle") : t("inviteSubtitle")}</p>
           {submitError && <p className="text-red-500 text-[13px] font-medium">{submitError}</p>}
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <ModalField
            label={t("nameLabel")}
            type="text"
            required
            value={formData.name}
            onChange={e => setFormData({...formData, name: e.target.value})}
            placeholder={t("namePlaceholder")}
          />

          <ModalField
            label={t("emailLabel")}
            type="email"
            required
            value={formData.email}
            onChange={e => setFormData({...formData, email: e.target.value})}
            placeholder={t("emailPlaceholder")}
          />

          <ModalFormField label={t("roleLabel")} htmlFor="super-admin-role">
            <select
              id="super-admin-role"
              value={formData.role}
              disabled
              className="px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground outline-none text-sm appearance-none opacity-50 cursor-not-allowed"
            >
              <option value="SUPER_ADMIN">{t("systemSuperAdmin")}</option>
            </select>
          </ModalFormField>

          <ModalField
            label={t("avatarLabel")}
            type="url"
            value={formData.image}
            onChange={e => setFormData({...formData, image: e.target.value})}
            placeholder="https://example.com/avatar.jpg"
          >
            <p className="text-[11px] text-muted">{t("avatarHint")}</p>
          </ModalField>

          <div className="flex justify-end gap-4 mt-6 pt-6 border-t border-border-dim">
            <Button
              variant="ghost"
              onClick={() => setIsAddModalOpen(false)}
              className="rounded-[10px] text-sm hover:bg-foreground/5"
            >
              {t("cancel")}
            </Button>
            <WriteButton

              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-[10px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 text-sm disabled:opacity-50"
            >
              {isSubmitting ? t("saving") : (editingUser ? t("updateUser") : t("sendInvite"))}
            </WriteButton>
          </div>
        </form>
      </SonaeModal>

      <ConfirmationModal
        isOpen={!!deletingUser}
        onClose={() => {
          setDeletingUser(null);
          setSubmitError("");
        }}
        title={t("deleteTitle")}
        cancelLabel={t("cancel")}
        confirmLabel={isSubmitting ? t("deleting") : t("deleteTitle")}
        isSubmitting={isSubmitting}
        onConfirm={confirmDelete}
        error={submitError}
      >
        <p>
          {t.rich("deleteBody", {
            name: deletingUser?.name ?? "",
            b: (chunks) => <strong className="text-foreground font-semibold">{chunks}</strong>,
          })}
        </p>
      </ConfirmationModal>

      <ConfirmationModal
        isOpen={!!deletingInvite}
        onClose={() => {
          setDeletingInvite(null);
          setSubmitError("");
        }}
        title={t("revokeTitle")}
        cancelLabel={t("cancel")}
        confirmLabel={isSubmitting ? t("revoking") : t("revokeTitle")}
        isSubmitting={isSubmitting}
        onConfirm={confirmRevoke}
        error={submitError}
      >
        <p>
          {t.rich("revokeBody", {
            email: deletingInvite?.email ?? "",
            b: (chunks) => <strong className="text-foreground font-semibold">{chunks}</strong>,
          })}
        </p>
      </ConfirmationModal>
    </div>
  );
}
