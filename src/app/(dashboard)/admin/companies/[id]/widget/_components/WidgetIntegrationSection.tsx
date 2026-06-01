import { AppWindow } from "lucide-react";
import { WidgetPanel } from "./WidgetPanel";

type WidgetIntegrationSectionProps = {
  allowedDomains: string;
  codeSnippet: string;
  copied: boolean;
  onCopy: () => void;
  setAllowedDomains: (value: string) => void;
  widgetId: string;
};

export function WidgetIntegrationSection({
  allowedDomains,
  codeSnippet,
  copied,
  onCopy,
  setAllowedDomains,
  widgetId,
}: WidgetIntegrationSectionProps) {
  return (
    <WidgetPanel
      title="Integration"
      description="Connect your secure agent connection pipeline into external domains."
    >
      <div className="flex flex-col gap-3">
        <label className="text-[13px] font-semibold text-secondary">Authorized Domains</label>
        <input
          type="text"
          value={allowedDomains}
          onChange={(event) => setAllowedDomains(event.target.value)}
          className="w-full bg-background border border-border-dim rounded-[10px] px-4 py-2.5 text-[14px] text-foreground focus:outline-none focus:border-brand transition-colors font-mono"
          placeholder="https://example.com, https://app.example.com"
        />
      </div>

      <div className="mt-4">
        <label className="text-[13px] font-semibold text-secondary mb-3 block">
          Copy AI chat code snippet to clipboard
        </label>
        <div className="bg-background border border-border-dim rounded-[12px] overflow-hidden flex flex-col relative group">
          <pre className="p-5 text-[13px] text-muted overflow-x-auto font-mono leading-relaxed select-all">
            {codeSnippet}
          </pre>
          <div className="border-t border-border-dim bg-foreground/5 py-4 px-5">
            <button
              onClick={onCopy}
              className="px-6 py-2 rounded-[8px] bg-brand text-white font-medium hover:bg-brand/90 transition-colors flex items-center justify-center min-w-[160px]"
            >
              {copied ? "Copied!" : "Copy to clipboard"}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-6 border-t border-border-dim border-dashed">
        <p className="text-[13px] text-secondary mb-4 leading-relaxed">
          Test your Widget configuration safely inside the Sonae Sandbox Environment.
        </p>
        <a
          href={`/sandbox/${widgetId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full max-w-sm py-3 rounded-full bg-foreground text-background font-bold text-[13px] shadow-lg hover:scale-[1.02] transition-transform"
        >
          <AppWindow className="w-4 h-4" />
          Test Widget Sandbox
        </a>
      </div>
    </WidgetPanel>
  );
}
