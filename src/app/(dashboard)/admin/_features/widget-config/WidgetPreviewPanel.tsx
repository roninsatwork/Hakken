import Image from "next/image";
import { AppWindow, MessageSquare, X } from "lucide-react";

type WidgetPreviewPanelProps = {
  activeColor: string;
  conversationStarters: string[];
  enableGreeting: boolean;
  isSimulatorOpen: boolean;
  logoPreviewUrl: string | null;
  name: string;
  requireEmail: boolean;
  requireName: boolean;
  setIsSimulatorOpen: (value: boolean) => void;
  showPopupPreview: boolean;
  themeGreeting: string;
  themeLogoUrl: string;
  themePlaceholder: string;
};

/**
 * A picture of the customer's chat widget as it will look on their own website.
 *
 * Every box below is hand-written and stays that way. This is not a form on a
 * Sonae screen — nothing here can be typed into, nothing is submitted, and the
 * styling is deliberately the widget's own rather than the house one: white
 * background, grey borders, the customer's brand colour. Putting the shared
 * field in here would make the preview stop looking like the thing it is
 * previewing, which is the only job it has.
 *
 * The usual reason for the shared field — that it ties a label to a box so a
 * screen reader can name it — does not apply either. These are disabled
 * placeholders in a picture, not controls.
 */
export function WidgetPreviewPanel({
  activeColor,
  conversationStarters,
  enableGreeting,
  isSimulatorOpen,
  logoPreviewUrl,
  name,
  requireEmail,
  requireName,
  setIsSimulatorOpen,
  showPopupPreview,
  themeGreeting,
  themeLogoUrl,
  themePlaceholder,
}: WidgetPreviewPanelProps) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-4 self-start lg:sticky lg:top-6">
      {/*
        No staged backdrop behind the widget.
        A pale card with a fixed 3:4 shape used to stand in for a website page.
        It reserved a tall block whatever the widget's own height was, and that
        is space the configuration form beside it wants back.
      */}
      <div className="relative mx-auto flex w-full max-w-[380px] flex-col items-end justify-end">
        <div className="w-[320px] flex flex-col items-end gap-3 drop-shadow-2xl relative">
          {!isSimulatorOpen && showPopupPreview && enableGreeting && themeGreeting && (
            <div className="w-full relative animate-in slide-in-from-bottom-4 fade-in duration-500 mb-2">
              <div className="bg-white p-4 rounded-[16px] shadow-lg text-[13.5px] font-medium text-gray-800 leading-[1.6]">
                {themeGreeting}
              </div>
              <div className="absolute -bottom-2 right-6 w-4 h-4 bg-white rotate-45" />
            </div>
          )}

          <div
            className={`w-full bg-white rounded-[24px] overflow-hidden shadow-2xl flex flex-col h-[400px] border border-gray-100 transition-all origin-bottom-right ease-out duration-300 ${
              isSimulatorOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none absolute bottom-[80px] right-0"
            }`}
          >
            <div
              className="px-5 py-4 flex items-center justify-between text-white shrink-0"
              style={{ backgroundColor: activeColor }}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center overflow-hidden shrink-0 border border-white/30 backdrop-blur-md">
                  {themeLogoUrl ? (
                    logoPreviewUrl ? (
                      <Image
                        src={logoPreviewUrl}
                        alt="logo"
                        width={32}
                        height={32}
                        unoptimized
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <AppWindow className="w-4 h-4 text-white" />
                    )
                  ) : (
                    <AppWindow className="w-4 h-4 text-white" />
                  )}
                </div>
                <span className="font-semibold tracking-wide text-[15px]">{name || "Website Bot"}</span>
              </div>
              <X
                onClick={() => setIsSimulatorOpen(false)}
                className="w-5 h-5 opacity-70 cursor-pointer hover:opacity-100 transition-opacity"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-[#f9fafb] relative">
              {requireName || requireEmail ? (
                <div className="flex flex-col gap-4 my-auto p-2">
                  <h3 className="font-semibold text-gray-800 text-[14px]">Before we begin...</h3>
                  <div className="flex flex-col gap-3">
                    {requireName && (
                      <input
                        type="text"
                        disabled
                        placeholder="Full Name"
                        className="w-full bg-white border border-gray-200 rounded-[8px] px-3 py-2.5 text-[13px] opacity-70"
                      />
                    )}
                    {requireEmail && (
                      <input
                        type="email"
                        disabled
                        placeholder="Email Address"
                        className="w-full bg-white border border-gray-200 rounded-[8px] px-3 py-2.5 text-[13px] opacity-70"
                      />
                    )}
                    <button
                      disabled
                      style={{ backgroundColor: activeColor }}
                      className="w-full py-2.5 rounded-[8px] text-white font-medium text-[13px] mt-2 opacity-80"
                    >
                      Start Chat
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {enableGreeting && themeGreeting && (
                    <div className="flex items-end gap-2 max-w-[85%] self-start">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mb-1"
                        style={{ backgroundColor: activeColor }}
                      >
                        {logoPreviewUrl ? (
                          <Image
                            src={logoPreviewUrl}
                            alt="logo"
                            width={24}
                            height={24}
                            unoptimized
                            className="w-full h-full object-cover rounded-full"
                          />
                        ) : (
                          <AppWindow className="w-3 h-3 text-white" />
                        )}
                      </div>
                      <div className="p-3 bg-white border border-gray-200 rounded-[14px] rounded-bl-sm text-[13px] text-gray-700 shadow-sm leading-relaxed">
                        {themeGreeting}
                      </div>
                    </div>
                  )}

                  {conversationStarters.length > 0 && !enableGreeting && (
                    <div className="flex flex-col gap-2 mt-auto pb-2 self-end items-end w-full">
                      {conversationStarters.map((starter, index) => (
                        <div
                          key={`${starter}-${index}`}
                          className="px-4 py-2 rounded-full border border-brand bg-brand/5 text-[12px] text-brand font-medium shadow-sm max-w-[90%] text-right cursor-pointer hover:bg-brand/10 transition-colors"
                        >
                          {starter}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="p-3 bg-white border-t border-gray-100 flex items-center gap-2 shrink-0 shadow-[0_-5px_15px_rgba(0,0,0,0.02)] relative z-10">
              <div className="flex-1 bg-gray-100/80 rounded-full h-10 flex items-center px-4">
                <span className="text-[13px] text-gray-400">{themePlaceholder}</span>
              </div>
              <div
                className="w-10 h-10 flex items-center justify-center rounded-full cursor-pointer shadow-md transition-transform hover:scale-105"
                style={{ backgroundColor: activeColor }}
              >
                <MessageSquare className="w-4 h-4 text-white -mt-0.5" />
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsSimulatorOpen(!isSimulatorOpen)}
            className="w-[60px] h-[60px] rounded-full shadow-[0_8px_24px_rgba(0,0,0,0.2)] flex items-center justify-center transition-transform hover:scale-105 relative z-10 shrink-0 mt-2"
            style={{ backgroundColor: activeColor }}
          >
            {isSimulatorOpen ? <X className="w-6 h-6 text-white" /> : <MessageSquare className="w-6 h-6 text-white" />}
          </button>
        </div>
      </div>
    </div>
  );
}
