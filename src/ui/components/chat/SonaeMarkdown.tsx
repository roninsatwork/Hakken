"use client";

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface SonaeMarkdownProps {
  content: string;
}

export function SonaeMarkdown({ content }: SonaeMarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ node, ...props }) => <p className="mb-3 last:mb-0 leading-[1.6] opacity-90" {...props} />,
        a: ({ node, ...props }) => (
          <a className="text-brand font-medium hover:underline underline-offset-4 decoration-brand/30 transition-all" target="_blank" rel="noopener noreferrer" {...props} />
        ),
        strong: ({ node, ...props }) => <strong className="font-semibold text-foreground tracking-wide" {...props} />,
        em: ({ node, ...props }) => <em className="italic opacity-80" {...props} />,
        h1: ({ node, ...props }) => <h1 className="text-xl font-bold text-foreground mb-3 tracking-tight" {...props} />,
        h2: ({ node, ...props }) => <h2 className="text-lg font-bold text-foreground mb-2 tracking-tight mt-5" {...props} />,
        h3: ({ node, ...props }) => <h3 className="text-base font-semibold text-foreground mb-2 tracking-wide mt-3" {...props} />,
        ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-3 space-y-2.5 marker:text-brand marker:opacity-80" {...props} />,
        ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-3 space-y-2.5 marker:text-brand marker:opacity-80" {...props} />,
        li: ({ node, ...props }) => <li className="text-[14px] leading-[1.6] text-secondary [&>p]:mb-0" {...props} />,
        blockquote: ({ node, ...props }) => (
          <blockquote className="border-l-2 border-brand/50 pl-4 py-1 mb-4 italic text-muted bg-foreground/5 rounded-r-[8px]" {...props} />
        ),
        code: ({ node, inline, ...props }: any) => {
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
