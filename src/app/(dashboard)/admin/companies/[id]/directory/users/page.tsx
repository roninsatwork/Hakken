"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import Image from "next/image";
import { 
  Users, 
  Plus, 
  ShieldCheck,
  User,
  Trash2,
  Edit2,
  ChevronDown,
  RefreshCw
} from "lucide-react";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { Button } from "@/src/ui/atoms/Button";
import Link from "next/link";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ModalField, ModalFormField } from "@/src/ui/components/screens/ModalForm";
import { RowActions, RowIconButton, SearchBar } from "@/src/ui/components/screens/Table";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { usePagedRows } from "@/src/hooks/usePagedRows";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { formatDate } from "@/src/lib/dates";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { ASSIGNABLE_ROLES, ROLE_DESCRIPTION_KEYS, ROLE_LABEL_KEYS, type UserRole } from "@/src/lib/userRoles";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";

type CompanyUser = Doc<"users">;
type PendingInvite = Doc<"invitations">;

type UserFormData = {
  name: string;
  email: string;
  role: UserRole;
  image: string;
  companyId: string;
};


export default function CompanyUsersPage() {
  const t = useTranslations('companyUsers');
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as Id<"companies">;

  const currentUser = useQuery(api.users.getMe);
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";

  const { results: paginatedUsers, status, loadMore } = usePaginatedQuery(
    api.users.getUsersByCompany,
    { companyId },
    { initialNumItems: TABLE_PAGE_SIZE }
  );

  const pendingInvites = useQuery(api.invites.getInvitesByCompany, { companyId }) || [];
  const deleteUser = useMutation(api.users.deleteUser);
  const revokeInvite = useMutation(api.invites.revokeInvite);
  const addUser = useMutation(api.users.addUser);
  const updateUser = useMutation(api.users.updateUser);

  const assignSuperAdmin = useMutation(api.users.assignSuperAdminToCompany);
  const detachSuperAdmin = useMutation(api.users.detachSuperAdminFromCompany);

  const [searchTerm, setSearchTerm] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedAdminId, setSelectedAdminId] = useState("");
  const [editingUser, setEditingUser] = useState<CompanyUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<CompanyUser | null>(null);
  const [detachingAdmin, setDetachingAdmin] = useState<CompanyUser | null>(null);
  const [deletingInvite, setDeletingInvite] = useState<PendingInvite | null>(null);

  const unassignedSuperAdmins = useQuery(
    api.users.getUnassignedSuperAdmins,
    isSuperAdmin && isAssignModalOpen ? { companyId } : "skip"
  ) || [];

  const [formData, setFormData] = useState<UserFormData>({ name: "", email: "", role: "USER", image: "", companyId: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdminId) return;
    setIsSubmitting(true);
    try {
      await assignSuperAdmin({ userId: selectedAdminId as Id<"users">, companyId });
      setIsAssignModalOpen(false);
      setSelectedAdminId("");
    } catch (err: unknown) {
      setSubmitError(getErrorMessage(err, "Failed to assign system admin."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDetach = async () => {
    if (detachingAdmin) {
      setIsSubmitting(true);
      try {
        await detachSuperAdmin({ userId: detachingAdmin._id });
        setDetachingAdmin(null);
      } catch (err: unknown) {
        setSubmitError(getErrorMessage(err, "Failed to detach system admin."));
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const filteredUsers = paginatedUsers.filter((u) =>
    (u.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.email || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredInvites = pendingInvites.filter((inv) =>
    (inv.email || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSearch = (v: string) => {
    setSearchTerm(v);
  };

  // Invitations and people share one table, so they share one page count.
  // Paged together, then split again for rendering — the footer must report the
  // table, not one half of it.
  const directoryRows = [
    ...filteredInvites.map((invite) => ({ kind: "invite" as const, invite })),
    ...filteredUsers.map((user) => ({ kind: "user" as const, user })),
  ];

  const paged = usePagedRows(directoryRows, {
    canLoadMore: status === "CanLoadMore",
    loadMore,
    resetKey: searchTerm,
  });


  const handleOpenEdit = (user: CompanyUser) => {
    setFormData({ name: user.name || "", email: user.email || "", role: user.role || "USER", image: user.image || "", companyId: user.companyId || "" });
    setEditingUser(user);
    setSubmitError("");
    setIsAddModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const payload = {
      ...formData,
      role: formData.role,
      companyId
    };
    try {
      if (editingUser) {
        await updateUser({ id: editingUser._id, ...payload });
      } else {
        await addUser(payload);
      }
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
      <header>
      <PageHeader
        icon={<Users className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("description")}
        action={
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <Button
                variant="quiet"
                onClick={() => { setSubmitError(""); setIsAssignModalOpen(true); }}
                className="flex items-center gap-2 rounded-[10px] text-[13px] bg-sidebar text-foreground hover:bg-foreground/5 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>{t("addSystemAdmin")}</span>
              </Button>
            )}
            <Link
              href={`/admin/companies/${companyId}/directory/invites`}
              className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-[13px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10"
            >
              <Plus className="w-4 h-4" />
              <span>{t("inviteUser")}</span>
            </Link>
          </div>
        }
      />
      </header>

      <SearchBar value={searchTerm} onChange={handleSearch} placeholder={t("searchPlaceholder")} />

      {/* Users Table */}
      <DataTable
        rows={status === "LoadingFirstPage" ? undefined : paged.pageRows}
        rowKey={(row) => (row.kind === "invite" ? `inv-${row.invite._id}` : `user-${row.user._id}`)}
        /* A pending invitation is not a person yet. */
        rowClassName={(row) => (row.kind === "invite" ? "bg-brand/[0.03] hover:bg-brand/[0.05] opacity-80" : "")}
        /* Only a person's row opens; an invitation has nothing to open. */
        rowClickable={(row) => row.kind === "user"}
        onRowClick={(row) => {
          if (row.kind === "user") router.push(`/admin/users/${row.user._id}`);
        }}
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
          isLoading: status === "LoadingMore" || status === "LoadingFirstPage",
          onPageChange: paged.goToPage,
          labels: { empty: t('table.empty') },
        }}
        columns={[
          {
            key: "user",
            header: "User",
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
                    src={row.user.image || `https://api.dicebear.com/7.x/notionists/svg?seed=${row.user.name}`}
                    alt={row.user.name || "User avatar"}
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
            key: "role",
            header: "Role",
            cell: (row) =>
              row.kind === "invite" ? (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-brand/10 border border-brand/20 w-fit">
                  <span className="text-[10px] font-mono tracking-widest text-brand uppercase">
                    PENDING {row.invite.role}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-foreground/5 border border-border-dim w-fit">
                  {row.user.role === 'ADMIN' ? <ShieldCheck className="w-3 h-3 text-brand" /> : <User className="w-3 h-3 text-foreground/70" />}
                  <span className="text-[10px] font-mono tracking-widest text-foreground/80 uppercase">
                    {row.user.role || 'USER'}
                  </span>
                </div>
              ),
          },
          {
            key: "joined",
            header: "Joined",
            cell: (row) => (
              <span className="text-[12px] text-secondary">
                {row.kind === "invite" ? formatDate(row.invite.invitedAt) : formatDate(row.user.createdAt)}
              </span>
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
                  <RowIconButton onClick={() => setDeletingInvite(row.invite)} tone="danger" label={t("revokeInvitation")}>
                    <Trash2 className="w-4 h-4" />
                  </RowIconButton>
                </RowActions>
              ) : (
                <RowActions>
                  {(row.user.role !== "SUPER_ADMIN" || isSuperAdmin) && (
                    <RowIconButton onClick={() => handleOpenEdit(row.user)} label="Edit user">
                      <Edit2 className="w-4 h-4" />
                    </RowIconButton>
                  )}
                  {row.user.role === "SUPER_ADMIN" ? (
                    isSuperAdmin && (
                      <RowIconButton onClick={() => setDetachingAdmin(row.user)} label={t("detachSystemAdmin")}>
                        <RefreshCw className="w-4 h-4" />
                      </RowIconButton>
                    )
                  ) : (
                    <RowIconButton onClick={() => setDeletingUser(row.user)} tone="danger" label={t("deleteUser")}>
                      <Trash2 className="w-4 h-4" />
                    </RowIconButton>
                  )}
                </RowActions>
              ),
          },
        ]}
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
          {editingUser ? (
            <div className="flex flex-col gap-3 p-4 rounded-[10px] bg-foreground/[0.02] border border-border-dim/50 mb-2">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-secondary uppercase tracking-widest">{t("userLabel")}</span>
                <span className="text-[14px] text-foreground font-medium">{editingUser.name}</span>
                <span className="text-[13px] text-secondary">{editingUser.email}</span>
              </div>
            </div>
          ) : (
            <>
              <ModalField
                label={t("fullName")}
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="e.g. Aman"
              />

              <ModalField
                label={t("emailAddress")}
                type="email"
                required
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
                placeholder="aman@example.com"
              />
            </>
          )}

          <ModalFormField label="System Role" htmlFor="company-user-role">
            <select
              id="company-user-role"
              value={formData.role}
              onChange={e => setFormData({...formData, role: e.target.value as UserRole})}
              className="px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all text-sm appearance-none"
            >
              {ASSIGNABLE_ROLES
                .filter(role => role !== "SUPER_ADMIN")
                .map(role => (
                  <option key={role} value={role}>{t(`roles.${ROLE_LABEL_KEYS[role]}`)}</option>
                ))}
            </select>
            <p className="text-[13px] text-secondary">
              {t(`roles.${ROLE_DESCRIPTION_KEYS[formData.role]}`)}
            </p>
          </ModalFormField>

          {!editingUser && (
            <ModalField
              label="Avatar URL (Optional)"
              type="url"
              value={formData.image}
              onChange={e => setFormData({...formData, image: e.target.value})}
              placeholder="https://example.com/avatar.jpg"
            >
              <p className="text-[11px] text-muted">Leave blank to auto-generate from name.</p>
            </ModalField>
          )}

          <div className="flex justify-end gap-4 mt-6 pt-6 border-t border-border-dim">
            <Button
              variant="ghost"
              onClick={() => setIsAddModalOpen(false)}
              className="rounded-[10px] text-sm hover:bg-foreground/5"
            >
              Cancel
            </Button>
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
        onClose={() => { setDeletingUser(null); setSubmitError(""); }}
        title={t("deleteUser")}
        cancelLabel="Cancel"
        confirmLabel={isSubmitting ? t("deleting") : t("deleteUser")}
        isSubmitting={isSubmitting}
        onConfirm={confirmDelete}
        error={submitError}
      >
        Are you sure you want to delete{" "}
        <strong className="text-foreground font-semibold">{deletingUser?.name}</strong>? This action cannot be undone.
      </ConfirmationModal>

      {/* Revoke Invitation Modal */}
      <ConfirmationModal
        isOpen={!!deletingInvite}
        onClose={() => { setDeletingInvite(null); setSubmitError(""); }}
        title="Revoke Access"
        cancelLabel="Cancel"
        confirmLabel={isSubmitting ? "Revoking..." : "Revoke Access"}
        isSubmitting={isSubmitting}
        onConfirm={confirmRevoke}
        error={submitError}
      >
        Are you sure you want to revoke the active invitation for{" "}
        <strong className="text-foreground font-semibold">{deletingInvite?.email}</strong>? This will permanently disable their sign-on link and delete their invitation record.
      </ConfirmationModal>

      {/* Assign System Admin Modal */}
      <SonaeModal
        isOpen={isAssignModalOpen}
        onClose={() => { setIsAssignModalOpen(false); setSubmitError(""); }}
        title={t("assignSystemAdmin")}
      >
        <div className="flex flex-col gap-2 mb-6">
          <p className="text-secondary text-[15px] leading-relaxed">
            {t("attachExistingAdmin")}
          </p>
          {submitError && <p className="text-red-500 text-[13px] font-medium">{submitError}</p>}
        </div>

        <form onSubmit={handleAssignSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-medium text-secondary uppercase tracking-widest">{t("selectAdministrator")}</label>
            <div className="relative">
              <select
                required
                value={selectedAdminId}
                onChange={(e) => setSelectedAdminId(e.target.value)}
                className="w-full px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all text-sm appearance-none pr-10"
              >
                <option value="">{t("chooseAdmin")}</option>
                {unassignedSuperAdmins.map((admin) => (
                  <option key={admin._id} value={admin._id}>
                    {admin.name} ({admin.email})
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-secondary">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-4 mt-6 pt-6 border-t border-border-dim">
            <Button
              variant="ghost"
              onClick={() => setIsAssignModalOpen(false)}
              className="rounded-[10px] text-sm hover:bg-foreground/5"
            >
              Cancel
            </Button>
            <WriteButton
              type="submit"
              disabled={isSubmitting || !selectedAdminId}
              className="px-6 py-2.5 rounded-[10px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 text-sm disabled:opacity-50"
            >
              {isSubmitting ? "Assigning..." : t("assignToWorkspace")}
            </WriteButton>
          </div>
        </form>
      </SonaeModal>

      <ConfirmationModal
        isOpen={!!detachingAdmin}
        onClose={() => { setDetachingAdmin(null); setSubmitError(""); }}
        title={t("detachSystemAdmin")}
        cancelLabel="Cancel"
        confirmLabel={isSubmitting ? t("detaching") : t("detach")}
        isSubmitting={isSubmitting}
        onConfirm={confirmDetach}
        error={submitError}
      >
        {t("detachConfirm", { name: detachingAdmin?.name || "" })}
      </ConfirmationModal>
    </div>
  );
}
