import { headers } from "next/headers";
import { mintWidgetEmbedPass } from "@/convex/utils/widgetEmbedPass";
import { parseHostFromUrl } from "@/convex/utils/widgetOriginPolicy";
import { WidgetIframeClient } from "./WidgetIframeClient";

/**
 * The widget page's server half. By the time this renders, the middleware in
 * `src/proxy.ts` has already applied the embed policy to the document request
 * (unknown widgets and disallowed referers never get here). What this adds is
 * the embed pass: a signed record of the referer host the server itself
 * observed, which `createWidgetThread` requires before it will open an
 * anonymous conversation — so a script calling the public API directly, with
 * no served page behind it, is refused. See `convex/utils/widgetEmbedPass.ts`.
 */
export default async function WidgetIframePage({
  params,
}: {
  params: Promise<{ widgetId: string }>;
}) {
  const { widgetId } = await params;
  const requestHeaders = await headers();
  const referer = requestHeaders.get("referer");
  const embedHost = referer ? parseHostFromUrl(referer) : null;

  const secret = process.env.WIDGET_EMBED_SIGNING_SECRET?.trim();
  if (!secret) {
    // Fail closed but visibly: the page renders and thread creation is
    // refused server-side, and the operator can see why in this log.
    console.error("WIDGET_EMBED_SIGNING_SECRET is not configured; widget sessions will be refused.");
  }
  const embedPass = secret ? await mintWidgetEmbedPass({ widgetId, embedHost, secret }) : null;

  return <WidgetIframeClient embedPass={embedPass} />;
}
