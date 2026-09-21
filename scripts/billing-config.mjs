import fs from "node:fs";
import path from "node:path";
import { parseBillingConfig } from "../billing.config.ts";
import { frameworkRoot } from "./product-config.mjs";

export function readBilling(root = frameworkRoot) {
  try { return parseBillingConfig(JSON.parse(fs.readFileSync(path.join(root, "hakken.billing.json"), "utf8"))); }
  catch { throw new Error("Cannot read billing configuration. Check hakken.billing.json; values are not printed."); }
}
