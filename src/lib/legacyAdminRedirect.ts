const LEGACY_ADMIN_REDIRECTS: Readonly<Record<string, string>> = {
  "/admin/agents/skills": "/admin/ai/skills",
};

export function legacyAdminRedirect(pathname: string): string | null {
  return LEGACY_ADMIN_REDIRECTS[pathname] ?? null;
}
