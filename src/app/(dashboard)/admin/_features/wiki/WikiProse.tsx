"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ComponentProps } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { LAYER } from "@/src/ui/lib/layers";

export type ResolvedWikiLink = {
  key: string;
  slug: string;
  pageId: Id<"wikiPages">;
  title: string;
  excerpt: string;
};

const WIKI_SCHEME = "sonae-wiki:";

/**
 * A wiki page rendered for READING (reading-wiki designs, screen 1):
 * markdown typeset in the house style, and every [[reference]] that
 * resolves to a living page becomes a live link with a hover peek. A
 * reference to nothing stays plain text — no ghost links.
 */
/**
 * A source note is a raw website capture, stored exactly as scraped — for
 * display only, the reader smooths the scrape's damage: heading markers
 * glued mid-sentence get their line back, and paragraph breaks that fall
 * mid-sentence (no closing punctuation, lowercase continuation) are
 * rejoined. The stored original is never touched.
 */
function tidyRawCapture(content: string): string {
  const brokenLinesRepaired = content
    // Navigation junk the scraper swallowed whole.
    .replace(/\b(BACK TO TOP|Skip to content|Email Us\s*[—–-]*)\b/gi, " ")
    .replace(/([^\n])\s(#{1,6}\s)/g, "$1\n\n$2")
    .replace(/([\p{Ll},;:—–-])\n{2,}([\p{Ll}])/gu, "$1 $2");
  // A glued heading drags its whole paragraph into giant bold text. A
  // real heading is short; when the "heading" runs long, the marks come
  // off and the line reads as body — better plain than shouting.
  const demoted = brokenLinesRepaired
    .split("\n")
    .map((line) => {
      const match = line.match(/^(#{1,6})\s+(.*)$/);
      if (!match) return line;
      const text = match[2];
      if (text.length <= 70) return line;
      const sentenceEnd = text.search(/[.!?]\s/);
      // Heading glued to its first paragraph: split where the first
      // sentence ends if that still looks like a title, else demote.
      const head = sentenceEnd > 0 ? text.slice(0, sentenceEnd + 1) : "";
      if (head && head.length <= 70) {
        return `${match[1]} ${head.replace(/[.]$/, "")}\n\n${text.slice(sentenceEnd + 1).trim()}`;
      }
      return text;
    })
    .join("\n");

  // Real paragraphs end with closing punctuation. A fragment that stops
  // mid-thought rejoins whatever follows, so the scrape's chopped lines
  // read as the prose they were.
  const paragraphs = demoted.split(/\n{2,}/);
  const merged: string[] = [];
  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;
    const previous = merged[merged.length - 1];
    const previousOpen =
      previous !== undefined &&
      !previous.startsWith("#") &&
      !trimmed.startsWith("#") &&
      !/[.!?:"”)\]]$/.test(previous);
    if (previousOpen) {
      merged[merged.length - 1] = `${previous} ${trimmed}`;
    } else {
      merged.push(trimmed);
    }
  }
  return merged.join("\n\n");
}

export function WikiProse({
  content,
  resolvedLinks,
  basePath,
  rawCapture,
}: {
  content: string;
  resolvedLinks: ResolvedWikiLink[];
  basePath: string;
  /** True for SOURCE notes: scraped text that needs display smoothing. */
  rawCapture?: boolean;
}) {
  const bySlug = new Map(resolvedLinks.map((link) => [link.slug, link]));

  const readable = rawCapture ? tidyRawCapture(content) : content;

  // [[slug]] → markdown link on our own scheme, resolved references only.
  const prepared = readable.replace(/\[\[([^\]]+)\]\]/g, (whole, slug: string) =>
    bySlug.has(slug.trim()) ? `[${slug.trim()}](${WIKI_SCHEME}${slug.trim()})` : slug.trim()
  );

  const omitNode = <T extends { node?: unknown }>(props: T) => {
    const rest = { ...props };
    delete rest.node;
    return rest;
  };

  return (
    <div className="w-full text-[15px] leading-[1.75] text-foreground/90">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: (props) => <p className="mb-4 last:mb-0" {...omitNode(props)} />,
          h1: (props) => <h2 className="text-[18px] font-bold text-foreground mt-6 mb-3 tracking-tight" {...omitNode(props)} />,
          h2: (props) => <h3 className="text-[16px] font-bold text-foreground mt-5 mb-2 tracking-tight" {...omitNode(props)} />,
          h3: (props) => <h4 className="text-[14px] font-semibold text-foreground mt-4 mb-2" {...omitNode(props)} />,
          ul: (props) => <ul className="mb-4 pl-5 list-disc marker:text-muted" {...omitNode(props)} />,
          ol: (props) => <ol className="mb-4 pl-5 list-decimal marker:text-muted" {...omitNode(props)} />,
          li: (props) => <li className="mb-1" {...omitNode(props)} />,
          strong: (props) => <strong className="font-semibold text-foreground" {...omitNode(props)} />,
          em: (props) => <em className="italic" {...omitNode(props)} />,
          code: (props) => (
            <code className="px-1.5 py-0.5 rounded-[5px] bg-foreground/10 text-[13px]" {...omitNode(props)} />
          ),
          img: () => null,
          a: ({ href, children, ...rest }) => {
            if (href?.startsWith(WIKI_SCHEME)) {
              const slug = href.slice(WIKI_SCHEME.length);
              const target = bySlug.get(slug);
              if (!target) return <span>{children}</span>;
              return (
                <span className="relative inline-block group/wl">
                  <Link
                    href={`${basePath}/${target.pageId}`}
                    className="text-brand border-b border-dashed border-brand/40 hover:border-brand transition-colors"
                  >
                    {children}
                  </Link>
                  {/* The peek: read a page without leaving this one. */}
                  <span
                    className={`pointer-events-none absolute left-0 top-[calc(100%+6px)] ${LAYER.PAGE_MENU} hidden w-[320px] group-hover/wl:block rounded-[12px] border border-border-dim bg-sidebar px-4 py-3 text-[12.5px] leading-relaxed text-secondary shadow-xl`}
                  >
                    <span className="block text-[13px] font-semibold text-foreground mb-0.5">
                      {target.title}
                    </span>
                    {target.excerpt}…
                  </span>
                </span>
              );
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:underline underline-offset-4"
                {...omitNode(rest as { node?: unknown })}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {prepared}
      </ReactMarkdown>
    </div>
  );
}
