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
      <div className="w-full overflow-x-auto border border-border-dim rounded-[12px] bg-background text-[13px]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border-dim text-secondary font-semibold">
              <th className="px-6 py-4">Greeting name</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Enable/disable</th>
              <th className="px-6 py-4 text-right">Configure</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-6 py-5 font-medium text-foreground">Default greeting</td>
              <td className="px-6 py-5 text-muted">Active</td>
              <td className="px-6 py-5">
                <label className="flex items-center gap-2 cursor-pointer relative z-10 transition-opacity">
                  <div
                    className={`w-10 h-5 rounded-full flex items-center p-0.5 transition-colors ${
                      enableGreeting ? "bg-brand" : "bg-border-dim"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform ${
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
              </td>
              <td className="px-6 py-5">
                <div className="flex justify-end">
                  <textarea
                    rows={2}
                    value={themeGreeting}
                    onChange={(event) => setThemeGreeting(event.target.value)}
                    disabled={!enableGreeting}
                    className="w-64 bg-background border border-border-dim rounded-[8px] text-[13px] p-2 text-foreground focus:outline-none focus:border-brand resize-none placeholder-muted/50 disabled:opacity-50"
                    placeholder="Type a greeting message..."
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </WidgetPanel>
  );
}
