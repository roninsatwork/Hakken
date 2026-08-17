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
}): DataTableColumn<DirectoryRow>[] {
  return [
    {
      key: "administrator",
      header: "System Administrator",
      cell: (row) =>
        row.kind === "invite" ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-black border border-brand/20 border-dashed flex items-center justify-center">
              <span className="text-[9px] font-mono text-brand/50 uppercase tracking-widest">PND</span>
            </div>
            <div>
              <span className="font-medium text-[13px] text-foreground/70 block leading-tight">
                Pending Invitation
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
      header: "Joined Date",
      cell: (row) =>
        row.kind === "invite" ? (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-brand/10 border border-brand/20 w-fit">
            <span className="text-[10px] font-mono tracking-widest text-brand uppercase">
              PENDING {row.invite.role}
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
      header: "Actions",
      align: "right",
      cell: (row) =>
        row.kind === "invite" ? (
          <RowActions>
            <span className="text-[11px] font-mono text-brand/50 uppercase tracking-widest mr-2">
              Awaiting Login
            </span>
            <RowIconButton
              label="Revoke invitation"
              tone="danger"
              onClick={() => actions.onRevoke(row.invite)}
            >
              <Trash2 className="w-4 h-4" />
            </RowIconButton>
          </RowActions>
        ) : (
          <RowActions>
            <RowIconButton label="Edit administrator" onClick={() => actions.onEdit(row.user)}>
              <Edit2 className="w-4 h-4" />
            </RowIconButton>
            <RowIconButton
              label="Delete administrator"
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
    return <div className="p-8 text-secondary">Unauthorized area.</div>;
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
      setSubmitError(getErrorMessage(err, "Operation failed."));
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
        setSubmitError(getErrorMessage(err, "Failed to delete user."));
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
        setSubmitError(getErrorMessage(err, "Failed to revoke invite."));
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
            System Administrators
          </h1>
          <p className="text-[13px] text-secondary mt-1">Manage all system Super Admin accounts with complete systemic control.</p>
        </div>
        
        <Link 
          href="/admin/super-admins/invite"
          className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-[13px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10"
        >
          <Plus className="w-4 h-4" />
          <span>Invite User</span>
        </Link>
      </div>

      <DataTable<DirectoryRow>
        rows={isLoadingFirstPage ? undefined : paged.pageRows}
        rowKey={(row) => (row.kind === "invite" ? `inv-${row.invite._id}` : `user-${row.user._id}`)}
        columns={buildDirectoryColumns({ onEdit: handleOpenEdit, onDelete: setDeletingUser, onRevoke: setDeletingInvite })}
        search={{
          value: searchTerm,
          onChange: handleSearch,
          placeholder: "Search users by name or email...",
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
          label: "No users or pending invitations found matching your search.",
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
          labels: { empty: "No administrators" },
        }}
      />


      {/* Add/Edit Modal */}
      <SonaeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={editingUser ? "Edit User" : "Invite User"}
      >
        <div className="flex flex-col gap-2 mb-6">
           <p className="text-secondary text-[15px]">{editingUser ? "Update this user's details and roles." : "Invite a new user to the platform."}</p>
           {submitError && <p className="text-red-500 text-[13px] font-medium">{submitError}</p>}
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <ModalField
            label="Full Name"
            type="text"
            required
            value={formData.name}
            onChange={e => setFormData({...formData, name: e.target.value})}
            placeholder="e.g. Aman"
          />

          <ModalField
            label="Email Address"
            type="email"
            required
            value={formData.email}
            onChange={e => setFormData({...formData, email: e.target.value})}
            placeholder="aman@example.com"
          />

          <ModalFormField label="System Role" htmlFor="super-admin-role">
            <select
              id="super-admin-role"
              value={formData.role}
              disabled
              className="px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground outline-none text-sm appearance-none opacity-50 cursor-not-allowed"
            >
              <option value="SUPER_ADMIN">System Super Admin</option>
            </select>
          </ModalFormField>

          <ModalField
            label="Avatar URL (Optional)"
            type="url"
            value={formData.image}
            onChange={e => setFormData({...formData, image: e.target.value})}
            placeholder="https://example.com/avatar.jpg"
          >
            <p className="text-[11px] text-muted">Leave blank to auto-generate from name.</p>
          </ModalField>

          <div className="flex justify-end gap-4 mt-6 pt-6 border-t border-border-dim">
            <button 
              type="button" 
              onClick={() => setIsAddModalOpen(false)}
              className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-sm font-medium"
            >
              Cancel
            </button>
            <WriteButton

              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-[10px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 text-sm disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : (editingUser ? "Update User" : "Send Invite")}
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
        title="Delete User"
        cancelLabel="Cancel"
        confirmLabel={isSubmitting ? "Deleting..." : "Delete User"}
        isSubmitting={isSubmitting}
        onConfirm={confirmDelete}
        error={submitError}
      >
        <p>
          Are you sure you want to delete <strong className="text-foreground font-semibold">{deletingUser?.name}</strong>? This action cannot be undone.
        </p>
      </ConfirmationModal>

      <ConfirmationModal
        isOpen={!!deletingInvite}
        onClose={() => {
          setDeletingInvite(null);
          setSubmitError("");
        }}
        title="Revoke Access"
        cancelLabel="Cancel"
        confirmLabel={isSubmitting ? "Revoking..." : "Revoke Access"}
        isSubmitting={isSubmitting}
        onConfirm={confirmRevoke}
        error={submitError}
      >
        <p>
          Are you sure you want to revoke the active invitation for <strong className="text-foreground font-semibold">{deletingInvite?.email}</strong>? This will permanently disable their sign-on link and delete their invitation record.
        </p>
      </ConfirmationModal>
    </div>
  );
}
