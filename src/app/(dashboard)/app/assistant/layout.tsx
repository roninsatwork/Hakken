import ChatHistoryList from "@/src/ui/components/chat/ChatHistoryList";

/* This is a wrapper layout for the Sonae Assistant interface establishing the dual-pane architecture */
export default function AssistantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-[calc(100vh-64px)] gap-6 overflow-hidden">
      
      {/* Left Column: Historical Threads & Thread Generation */}
      <aside className="w-[300px] flex-shrink-0 hidden md:flex flex-col rounded-[20px] border border-border-dim bg-sidebar/20 backdrop-blur-xl shadow-md p-4 relative overflow-hidden z-20">
        <ChatHistoryList />
      </aside>

      {/* Right Column: Interaction Sandbox & Message Feeds */}
      <main className="flex-1 flex flex-col bg-sidebar/10 border border-border-dim rounded-[24px] shadow-lg backdrop-blur-2xl relative overflow-hidden z-20">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
        {children}
      </main>

    </div>
  );
}
