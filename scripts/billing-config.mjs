import fs from "node:fs";
import path from "node:path";
import { parseBillingConfig } from "../billing.config.ts";
import { frameworkRoot } from "./product-config.mjs";

export function readBilling(root = frameworkRoot) {
  try { return parseBillingConfig(JSON.parse(fs.readFileSync(path.join(root, "sonae.billing.json"), "utf8"))); }
  catch { throw new Error("Cannot read billing configuration. Check sonae.billing.json; values are not printed."); }
}
