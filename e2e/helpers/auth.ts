import type { Page } from "@playwright/test";

export type E2ERole = "super-admin" | "company-admin" | "user";

export async function setE2ERole(page: Page, role: E2ERole) {
  await page.context().addCookies([
    {
      name: "sonae_e2e_auth",
      value: role,
      domain: "localhost",
      path: "/",
      expires: -1,
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}
