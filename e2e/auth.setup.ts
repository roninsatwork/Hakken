import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { test as setup } from "@playwright/test";

const authDir = path.join(process.cwd(), "e2e/.auth");

async function writeStorageState(role: "super-admin" | "company-admin" | "user") {
  await mkdir(authDir, { recursive: true });
  await writeFile(
    path.join(authDir, `${role}.json`),
    JSON.stringify(
      {
        cookies: [
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
        ],
        origins: [],
      },
      null,
      2
    )
  );
}

setup("create deterministic role storage states", async () => {
  await Promise.all([
    writeStorageState("super-admin"),
    writeStorageState("company-admin"),
    writeStorageState("user"),
  ]);
});
