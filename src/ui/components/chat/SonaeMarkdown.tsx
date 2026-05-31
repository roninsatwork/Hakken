"use client";

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ComponentProps } from 'react';

interface SonaeMarkdownProps {
  content: string;
}

export function SonaeMarkdown({ content }: SonaeMarkdownProps) {
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
      components={{
        p: (props) => <p className="mb-3 last:mb-0 leading-[1.6] opacity-90" {...omitMarkdownNode(props)} />,
        a: (props) => (
          <a className="text-brand font-medium hover:underline underline-offset-4 decoration-brand/30 transition-all" target="_blank" rel="noopener noreferrer" {...omitMarkdownNode(props)} />
        ),
        strong: (props) => <strong className="font-semibold text-foreground tracking-wide" {...omitMarkdownNode(props)} />,
        em: (props) => <em className="italic opacity-80" {...omitMarkdownNode(props)} />,
        h1: (props) => <h1 className="text-lg font-bold text-foreground mb-3 tracking-tight" {...omitMarkdownNode(props)} />,
        h2: (props) => <h2 className="text-base font-bold text-foreground mb-2 tracking-tight mt-5" {...omitMarkdownNode(props)} />,
        h3: (props) => <h3 className="text-[14px] font-semibold text-foreground mb-2 tracking-wide mt-3" {...omitMarkdownNode(props)} />,
        ul: (props) => <ul className="list-disc pl-5 mb-3 space-y-2.5 marker:text-brand marker:opacity-80" {...omitMarkdownNode(props)} />,
        ol: (props) => <ol className="list-decimal pl-5 mb-3 space-y-2.5 marker:text-brand marker:opacity-80" {...omitMarkdownNode(props)} />,
        li: (props) => <li className="text-[14px] leading-[1.7] text-secondary [&>p]:mb-0" {...omitMarkdownNode(props)} />,
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
