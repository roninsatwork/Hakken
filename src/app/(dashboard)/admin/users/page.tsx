"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Users,
  Plus,
  MoreVertical,
  Trash2,
  Edit2
} from "lucide-react";
import { DirectoryTextCell } from "@/src/app/(dashboard)/_features/user-directory/DirectoryTableCells";
import { UserDirectoryScreen } from "@/src/app/(dashboard)/_features/user-directory/UserDirectoryScreen";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import type { Id } from "@/convex/_generated/dataModel";
import { ModalFormField } from "@/src/ui/components/screens/ModalForm";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { ASSIGNABLE_ROLES, ROLE_DESCRIPTION_KEYS, ROLE_LABEL_KEYS, type UserRole } from "@/src/lib/userRoles";

/**
 * The platform's people directory: `UserDirectoryScreen` with the platform's
 * choices filled in. What is written here is exactly what only this page
 * decides — the platform scope, the Workspace column and picker a super
 * admin sees, the profile links, and the invite desk this header points at.
 */
export default function ManageUsersPage() {
  const currentUser = useQuery(api.users.getMe);
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";
  const companyOptions = useQuery(api.companies.getCompanyOptions, isSuperAdmin ? {} : "skip") || [];
  const t = useTranslations('admin.users');
  const tCommon = useTranslations('common');
  const { platformName } = useSystemSettings();

  const getCompanyName = (id: string) => companyOptions.find((c) => c._id === id)?.name || t('table.systemLevel');

  return (
    <UserDirectoryScreen
      t={t}
      tCommon={tCommon}
      // The admin section is not scoped by the impersonated workspace —
      // impersonation is a front-end device. See convex/users.ts.
      scope="platform"
      emptySearchMessage="Nobody matches that search."
      header={() => (
        <PageHeader
          divider
          icon={<Users className="w-6 h-6 text-brand" />}
          title={t('title')}
          description={t('description')}
          action={
            <Link
              href="/admin/users/invite"
              className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-[13px] bg-brand text-white font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              <span>{t('invite')}</span>
            </Link>
          }
        />
      )}
      extraColumns={
        isSuperAdmin
          ? [
              {
                key: "workspace",
                header: t('table.workspace'),
                cell: (row) => (
                  <DirectoryTextCell>
                    {row.kind === "invite"
                      ? row.invite.companyId
                        ? getCompanyName(row.invite.companyId)
                        : t('table.systemLevel')
                      : row.user.companyId
                        ? row.user.companyName ?? getCompanyName(row.user.companyId)
                        : t('table.platformGlobal', { platformName })}
                  </DirectoryTextCell>
                ),
              },
            ]
          : []
      }
      userHref={(user) => `/admin/users/${user._id}`}
      userRoleLabel={(user) =>
        user.role === 'SUPER_ADMIN' ? t('roles.superAdmin') : user.role === 'ADMIN' ? t('roles.admin') : t('roles.user')
      }
      userActions={(user, { edit, remove }) => (
        <RowActions>
          {/* These carried no label at all, so they read as "button,
              button, button" to a screen reader. */}
          <Link
            href={`/admin/users/${user._id}`}
            aria-label={t('table.openProfile')}
            className="p-2 rounded-full hover:bg-foreground/5 text-secondary hover:text-foreground transition-colors"
          >
            <MoreVertical className="w-4 h-4" />
          </Link>
          <RowIconButton onClick={edit} label={tCommon('actions.edit')}>
            <Edit2 className="w-4 h-4" />
          </RowIconButton>
          <RowIconButton onClick={remove} tone="danger" label={t('buttons.delete')}>
            <Trash2 className="w-4 h-4" />
          </RowIconButton>
        </RowActions>
      )}
      roleFields={({ data, update }) => (
        <>
          <ModalFormField label={t('modal.role')} htmlFor="user-role">
            <select
              id="user-role"
              value={data.role}
              onChange={e => update({ role: e.target.value as UserRole })}
              className="px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all text-sm appearance-none"
            >
              {ASSIGNABLE_ROLES
                .filter(role => role !== "SUPER_ADMIN" || isSuperAdmin)
                .map(role => (
                  <option key={role} value={role}>{t(`roles.${ROLE_LABEL_KEYS[role]}`)}</option>
                ))}
            </select>
            <p className="text-[13px] text-secondary">
              {t(`roles.${ROLE_DESCRIPTION_KEYS[data.role]}`)}
            </p>
          </ModalFormField>

          {isSuperAdmin && (
            <ModalFormField label={t('modal.workspace')} htmlFor="user-workspace">
              <select
                id="user-workspace"
                value={data.companyId}
                onChange={e => update({ companyId: e.target.value })}
                className="px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all text-sm appearance-none"
              >
                <option value="">{t('table.systemLevel')}</option>
                {companyOptions.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </ModalFormField>
          )}
        </>
      )}
      editFormData={(user) => ({
        name: user.name ?? "",
        email: user.email ?? "",
        role: user.role || "USER",
        image: user.image || "",
        companyId: user.companyId || "",
      })}
      submitPayload={(data) => ({
        ...data,
        companyId: isSuperAdmin && data.companyId ? (data.companyId as Id<"companies">) : undefined,
      })}
    />
  );
}
