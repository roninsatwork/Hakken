import {
  buildFrameAncestors,
  isHostAllowed,
  parseHostFromUrl,
} from "@/convex/utils/widgetOriginPolicy";

/**
 * Decides how a `/w/<widgetId>` document request should be answered.
 *
 * Kept free of Next.js types so it can be unit tested directly. The middleware
 * turns this decision into a response.
 *
 * The widget renders in an iframe served from our own origin, so the embedding
 * site is not visible in the `Origin` header and nothing the iframe's own code
 * reports about its parent can be trusted. `frame-ancestors` is the control the
 * browser actually enforces; the referer check below is defence in depth for
 * the document request itself.
 */
export type WidgetEmbedDecision = {
  allowed: boolean;
  frameAncestors: string;
  /** Set when the request must be refused outright. */
  blockedReason?: "unknown_widget" | "referer_not_allowed";
  /** Host parsed from the referer, when there was a usable one. */
  refererHost?: string;
};

export function decideWidgetEmbed(args: {
  allowedDomains: string[] | undefined;
  widgetExists: boolean;
  referer: string | null;
}): WidgetEmbedDecision {
  // An unknown or inactive widget is embeddable nowhere. Still return a header
  // so the response never falls back to a permissive default.
  if (!args.widgetExists) {
    return { allowed: false, frameAncestors: "'none'", blockedReason: "unknown_widget" };
  }

  const frameAncestors = buildFrameAncestors(args.allowedDomains);
  const refererHost = args.referer ? parseHostFromUrl(args.referer) : null;

  // No referer means this is a direct visit rather than an embed, so there is
  // no host site to authorise. frame-ancestors still governs the framed case.
  if (!refererHost) {
    return { allowed: true, frameAncestors };
  }

  if (!isHostAllowed(refererHost, args.allowedDomains)) {
    return {
      allowed: false,
      frameAncestors,
      blockedReason: "referer_not_allowed",
      refererHost,
    };
  }

  return { allowed: true, frameAncestors, refererHost };
}

/** Extracts the widget id from a `/w/<widgetId>` pathname, if it is one. */
export function widgetIdFromPathname(pathname: string): string | null {
  const match = /^\/w\/([^/]+)\/?$/.exec(pathname);
  return match?.[1] ?? null;
}
