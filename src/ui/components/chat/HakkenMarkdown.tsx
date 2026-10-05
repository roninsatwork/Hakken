"use client";

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ComponentProps } from 'react';

interface HakkenMarkdownProps {
  content: string;
  /**
   * Words to pick out wherever they appear, as `<mark>`. Added for the Sites
   * Full answers page, which shows an AI engine's answer with the website's
   * own names marked (docs/plans/active/user-sites-plan.md, D9). Absent, the
   * renderer is exactly what it was.
   */
  highlight?: readonly string[];
  /**
   * Other names to pick out, marked differently: a website's competitors, on
   * the page of a search the AI ran (Sites, 2026-09-29). Absent, only
   * `highlight` is marked, as before.
   */
  highlightOthers?: readonly string[];
  /**
   * `answer` for an AI assistant's answer read on a page rather than in chat
   * (Keyword research's What the AI says, Anthony, 2026-10-05: "can we format
   * them better"): its links in the app's outside-link blue, as
   * `ExternalUrlCell` draws them — the brand colour reads as plain words in the
   * dark theme. Absent, the renderer is exactly what it was.
   */
  variant?: "chat" | "answer";
  /**
   * The pages an answer cites, in its own order: its `[n]` markers — Perplexity
   * writes them — become small links to the nth. Absent, `[n]` stays words.
   */
  citations?: readonly string[];
}

type HastNode = { type: string; value?: string; tagName?: string; properties?: Record<string, unknown>; children?: HastNode[] };

/** A rehype step that wraps each occurrence of the words in a `mark`, outside code; `others` are marked as such. */
function markWords(words: readonly string[], others: readonly string[] = []) {
  const otherWords = new Set(others.map((word) => word.trim().toLowerCase()));
  const escaped = [...words, ...others].filter((word) => word.trim().length > 1)
    .map((word) => word.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .sort((left, right) => right.length - left.length);
  const pattern = escaped.length > 0 ? new RegExp(`(${escaped.join("|")})`, "gi") : null;
  const walk = (node: HastNode) => {
    if (!node.children || node.tagName === "code" || node.tagName === "pre") return;
    node.children = node.children.flatMap((child): HastNode[] => {
      if (child.type !== "text" || !child.value || !pattern) {
        walk(child);
        return [child];
      }
      const parts = child.value.split(pattern);
      if (parts.length === 1) return [child];
      // With one capturing group, the matches sit at the odd places.
      return parts.flatMap((part, index): HastNode[] => {
        if (!part) return [];
        return index % 2 === 1
          ? [{ type: "element", tagName: "mark", properties: otherWords.has(part.toLowerCase()) ? { dataOther: "true" } : {}, children: [{ type: "text", value: part }] }]
          : [{ type: "text", value: part }];
      });
    });
  };
  return () => (tree: HastNode) => walk(tree);
}

/** A rehype step that turns each `[n]` an answer cites by into a link to its nth page, outside code and links. */
function linkCitations(citations: readonly string[]) {
  const marker = /\[(\d{1,3})\]/g;
  const walk = (node: HastNode) => {
    if (!node.children || node.tagName === "code" || node.tagName === "pre" || node.tagName === "a") return;
    node.children = node.children.flatMap((child): HastNode[] => {
      if (child.type !== "text" || !child.value) {
        walk(child);
        return [child];
      }
      const out: HastNode[] = [];
      let last = 0;
      for (const found of child.value.matchAll(marker)) {
        const page = citations[Number(found[1]) - 1];
        // Only a web page: the addresses come from the assistant's answer, not from us.
        if (!page || !/^https?:\/\//i.test(page)) continue;
        const at = found.index ?? 0;
        if (at > last) out.push({ type: "text", value: child.value.slice(last, at) });
        // "[1][3]" reads "1,3", not "13".
        const joined = at === last && out.length > 0;
        out.push({ type: "element", tagName: "a", properties: { href: page, dataCitation: found[1], ...(joined ? { dataJoined: "true" } : {}) }, children: [{ type: "text", value: found[1] }] });
        last = at + found[0].length;
      }
      if (out.length === 0) return [child];
      if (last < child.value.length) out.push({ type: "text", value: child.value.slice(last) });
      return out;
    });
  };
  return () => (tree: HastNode) => walk(tree);
}

export function HakkenMarkdown({ content, highlight, highlightOthers, variant = "chat", citations }: HakkenMarkdownProps) {
  type MarkdownCodeProps = ComponentProps<"code"> & {
    node?: unknown;
    inline?: boolean;
  };

  const omitMarkdownNode = <T extends { node?: unknown }>(props: T) => {
    const rest = { ...props };
    delete rest.node;
    return rest;
  };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[
        ...((citations?.length ?? 0) > 0 ? [linkCitations(citations ?? [])] : []),
        ...((highlight?.length ?? 0) + (highlightOthers?.length ?? 0) > 0 ? [markWords(highlight ?? [], highlightOthers)] : []),
      ]}
      components={{
        mark: (props) => {
          const { "data-other": other, ...rest } = omitMarkdownNode(props) as ComponentProps<"mark"> & { "data-other"?: string };
          return <mark className={other ? "rounded-[3px] bg-warning/20 px-0.5 text-foreground" : "rounded-[3px] bg-brand/20 px-0.5 text-foreground"} {...rest} />;
        },
        p: (props) => <p className="mb-3 last:mb-0 leading-[1.6] opacity-90" {...omitMarkdownNode(props)} />,
        a: (props) => {
          const { "data-citation": citation, "data-joined": joined, ...rest } = omitMarkdownNode(props) as ComponentProps<"a"> & { "data-citation"?: string; "data-joined"?: string };
          // A cited page's number, raised and small, as a footnote reads.
          if (citation) {
            return (
              <>
                {joined ? <span className="align-super text-[10px] text-muted">,</span> : null}
                <a className="ml-0.5 align-super text-[10px] font-medium text-info hover:underline" target="_blank" rel="noopener noreferrer nofollow" title={rest.href} {...rest} />
              </>
            );
          }
          return variant === "answer"
            ? <a className="text-info hover:underline underline-offset-4" target="_blank" rel="noopener noreferrer nofollow" {...rest} />
            : <a className="text-brand font-medium hover:underline underline-offset-4 decoration-brand/30 transition-all" target="_blank" rel="noopener noreferrer" {...rest} />;
        },
        strong: (props) => <strong className="font-semibold text-foreground tracking-wide" {...omitMarkdownNode(props)} />,
        em: (props) => <em className="italic opacity-80" {...omitMarkdownNode(props)} />,
        h1: (props) => <h1 className="text-lg font-bold text-foreground mb-3 tracking-tight" {...omitMarkdownNode(props)} />,
        h2: (props) => <h2 className="text-base font-bold text-foreground mb-2 tracking-tight mt-5" {...omitMarkdownNode(props)} />,
        h3: (props) => <h3 className="text-[14px] font-semibold text-foreground mb-2 tracking-wide mt-3" {...omitMarkdownNode(props)} />,
        ul: (props) => <ul className="list-disc pl-5 mb-3 space-y-2.5 marker:text-brand marker:opacity-80" {...omitMarkdownNode(props)} />,
        ol: (props) => <ol className="list-decimal pl-5 mb-3 space-y-2.5 marker:text-brand marker:opacity-80" {...omitMarkdownNode(props)} />,
        li: (props) => <li className="text-[14px] leading-[1.7] text-secondary [&>p]:mb-0" {...omitMarkdownNode(props)} />,
        // An answer's table in columns with rules between rows; a chat's is left as it was.
        ...(variant === "answer"
          ? {
              table: (props: ComponentProps<"table"> & { node?: unknown }) => (
                <div className="mb-3 overflow-x-auto"><table className="w-full border-collapse text-left text-[13px]" {...omitMarkdownNode(props)} /></div>
              ),
              th: (props: ComponentProps<"th"> & { node?: unknown }) => <th className="border-b border-border-dim px-3 py-2 font-medium text-foreground first:pl-0" {...omitMarkdownNode(props)} />,
              td: (props: ComponentProps<"td"> & { node?: unknown }) => <td className="border-b border-border-dim/50 px-3 py-2 align-top first:pl-0" {...omitMarkdownNode(props)} />,
            }
          : {}),
        blockquote: (props) => (
          <blockquote className="border-l-2 border-brand/50 pl-4 py-1 mb-4 italic text-muted bg-foreground/5 rounded-r-[8px]" {...omitMarkdownNode(props)} />
        ),
        code: (markdownProps: MarkdownCodeProps) => {
          const { inline, ...props } = omitMarkdownNode(markdownProps);
          return inline ? (
            <code className="bg-foreground/10 text-foreground px-1.5 py-0.5 rounded-[4px] font-mono text-[12px] tracking-wider" {...props} />
          ) : (
            <div className="relative group mb-5 mt-2 overflow-hidden rounded-[12px] border border-border-dim bg-[#0d0d0d]">
              <div className="flex items-center justify-between px-4 py-2 border-b border-border-dim bg-white/5">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                </div>
                <span className="text-[10px] uppercase tracking-[0.2em] font-mono text-muted">Snippet</span>
              </div>
              <pre className="p-4 overflow-x-auto text-[13px] font-mono leading-loose text-secondary custom-scrollbar">
                <code {...props} />
              </pre>
            </div>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
