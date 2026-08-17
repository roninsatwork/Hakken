import { TextAreaField } from "@/src/ui/components/screens/Field";
import { WidgetPanel } from "./WidgetPanel";

type WidgetGreetingSectionProps = {
  enableGreeting: boolean;
  setEnableGreeting: (value: boolean) => void;
  setThemeGreeting: (value: string) => void;
  themeGreeting: string;
};

export function WidgetGreetingSection({
  enableGreeting,
  setEnableGreeting,
  setThemeGreeting,
  themeGreeting,
}: WidgetGreetingSectionProps) {
  return (
    <WidgetPanel
      title="Greeting"
      description="Customize greeting message that will pop up automatically to the user."
    >
      {/*
        A setting, not a list.
        This was a table with four column headings — Greeting name, Status,
        Enable/disable, Configure — above exactly one hardcoded row, because
        there is only ever one greeting. Headings that promise a list which never
        arrives are worse than no headings. It reads as every other setting in the
        app now: the name and its switch on one line, the message underneath.
      */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[14px] font-medium text-foreground">Default greeting</span>
            <span className="text-[12px] text-secondary">
              {enableGreeting ? "Shown automatically to visitors." : "Turned off — visitors see nothing."}
            </span>
          </div>

          <label className="flex cursor-pointer items-center gap-2 transition-opacity">
            <span className="text-[12px] text-secondary">{enableGreeting ? "On" : "Off"}</span>
            <div
              className={`flex h-5 w-10 items-center rounded-full p-0.5 transition-colors ${
                enableGreeting ? "bg-brand" : "bg-border-dim"
              }`}
            >
              <div
                className={`h-4 w-4 rounded-full bg-white transition-transform ${
                  enableGreeting ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </div>
            <input
              type="checkbox"
              className="hidden"
              checked={enableGreeting}
              onChange={(event) => setEnableGreeting(event.target.checked)}
            />
          </label>
        </div>

        <TextAreaField
          label="Greeting message"
          rows={2}
          value={themeGreeting}
          onChange={(event) => setThemeGreeting(event.target.value)}
          disabled={!enableGreeting}
          placeholder="Type a greeting message..."
          className="resize-none disabled:opacity-50"
        />
      </div>
    </WidgetPanel>
  );
}
