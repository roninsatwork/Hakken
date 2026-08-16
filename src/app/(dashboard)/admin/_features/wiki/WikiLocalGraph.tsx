"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";

// The big map's own kind colours (WikiMapScreen), token-based per the
// theme ratchet: the neighbourhood wears the same uniform as the city.
const KIND_CLASS: Record<string, string> = {
  CUSTOMER: "text-brand",
  PRODUCT: "text-info",
  POLICY: "text-warning",
  ISSUE: "text-secondary",
  SOURCE: "text-muted",
};

/**
 * The local graph (living-wiki plan, phase 2): where you're standing —
 * this page in the middle, its links to the right, its backlinks to the
 * left, every dot a click. Drawn purely from the detail door's existing
 * data; the big map shows the whole brain, this shows the neighbourhood.
 */
export function WikiLocalGraph({
  title,
  kind,
  resolvedLinks,
  backlinks,
  basePath,
}: {
  title: string;
  kind: string;
  resolvedLinks: Array<{ key: string; slug: string; pageId: Id<"wikiPages">; title: string }>;
  backlinks: Array<{ pageId: Id<"wikiPages">; subjectKey: string; title: string; kind: string }>;
  basePath: string;
}) {
  const t = useTranslations("aiPages.localGraph");
  const router = useRouter();

  const WIDTH = 720;
  const HEIGHT = Math.max(150, Math.max(resolvedLinks.length, backlinks.length) * 34 + 60);
  const centreX = WIDTH / 2;
  const centreY = HEIGHT / 2;

  const shorten = (label: string) =>
    label.replace(/^https?:\/\//, "").slice(0, 26) + (label.length > 26 ? "…" : "");

  const column = (count: number, index: number) =>
    HEIGHT / 2 + (index - (count - 1) / 2) * 34;

  return (
    <div className="flex flex-col gap-2.5 pt-2 border-t border-border-dim">
      <p className="text-[11px] uppercase tracking-[0.1em] text-muted font-medium">{t("title")}</p>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full max-w-[760px]"
          role="img"
          aria-label={t("title")}
        >
          {backlinks.map((backlink, index) => {
            const y = column(backlinks.length, index);
            return (
              <line
                key={`in-${backlink.pageId}`}
                x1={170}
                y1={y}
                x2={centreX - 12}
                y2={centreY}
                stroke="currentColor"
                className="text-border-dim"
                strokeWidth={1}
              />
            );
          })}
          {resolvedLinks.map((link, index) => {
            const y = column(resolvedLinks.length, index);
            return (
              <line
                key={`out-${link.pageId}`}
                x1={centreX + 12}
                y1={centreY}
                x2={WIDTH - 170}
                y2={y}
                stroke="currentColor"
                className="text-border-dim"
                strokeWidth={1}
              />
            );
          })}

          {backlinks.map((backlink, index) => {
            const y = column(backlinks.length, index);
            return (
              <g
                key={`inn-${backlink.pageId}`}
                className={`cursor-pointer ${KIND_CLASS[backlink.kind] ?? "text-secondary"}`}
                onClick={() => router.push(`${basePath}/${backlink.pageId}`)}
              >
                <circle cx={170} cy={y} r={5} fill="currentColor" />
                <text
                  x={158}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-secondary hover:fill-foreground"
                  style={{ fontSize: 12 }}
                >
                  {shorten(backlink.kind === "SOURCE" ? backlink.title : backlink.subjectKey)}
                </text>
              </g>
            );
          })}

          <g className={KIND_CLASS[kind] ?? "text-secondary"}>
            <circle cx={centreX} cy={centreY} r={9} fill="currentColor" />
            <text
              x={centreX}
              y={centreY - 16}
              textAnchor="middle"
              className="fill-foreground"
              style={{ fontSize: 13, fontWeight: 600 }}
            >
              {shorten(title)}
            </text>
          </g>

          {resolvedLinks.map((link, index) => {
            const y = column(resolvedLinks.length, index);
            return (
              <g
                key={`outn-${link.pageId}`}
                className={`cursor-pointer ${KIND_CLASS[link.key.split(":")[0]] ?? "text-secondary"}`}
                onClick={() => router.push(`${basePath}/${link.pageId}`)}
              >
                <circle cx={WIDTH - 170} cy={y} r={5} fill="currentColor" />
                <text
                  x={WIDTH - 158}
                  y={y + 4}
                  className="fill-secondary hover:fill-foreground"
                  style={{ fontSize: 12 }}
                >
                  {shorten(link.key.startsWith("SOURCE:") ? link.title : link.slug)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
