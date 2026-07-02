import { WidgetPanel } from "./WidgetPanel";

type WidgetWelcomeSectionProps = {
  requireEmail: boolean;
  requireName: boolean;
  setRequireEmail: (value: boolean) => void;
  setRequireName: (value: boolean) => void;
};

export function WidgetWelcomeSection({
  requireEmail,
  requireName,
  setRequireEmail,
  setRequireName,
}: WidgetWelcomeSectionProps) {
  return (
    <WidgetPanel
      title="Welcome Screen"
      description="Add and customize input fields that will be shown at the first widget screen."
    >
      <div className="flex flex-col gap-4">
        <h3 className="text-[13px] font-semibold text-secondary">Choose the input fields to start a chat</h3>
        <label className="flex items-center gap-3 p-3 rounded-[12px] border border-border-dim bg-background/50 cursor-pointer hover:bg-foreground/5 transition-colors">
          <input
            type="checkbox"
            checked={requireName}
            onChange={(event) => setRequireName(event.target.checked)}
            className="rounded border-border-dim text-brand focus:ring-brand form-checkbox bg-transparent w-4 h-4"
          />
          <span className="text-[13px] text-foreground font-medium tracking-wide">Name input</span>
        </label>
        <label className="flex items-center gap-3 p-3 rounded-[12px] border border-border-dim bg-background/50 cursor-pointer hover:bg-foreground/5 transition-colors">
          <input
            type="checkbox"
            checked={requireEmail}
            onChange={(event) => setRequireEmail(event.target.checked)}
            className="rounded border-border-dim text-brand focus:ring-brand form-checkbox bg-transparent w-4 h-4"
          />
          <span className="text-[13px] text-foreground font-medium tracking-wide">Email input</span>
        </label>
      </div>
    </WidgetPanel>
  );
}
