import ChatHistoryList from "@/src/ui/components/chat/ChatHistoryList";
import Header from "@/src/ui/components/layout/Header";

/**
 * Two planes, not two cards.
 *
 * The history and the conversation used to be rounded, bordered, blurred
 * cards floating inside a page that was already a card — three frames deep
 * before any content. They are now flat planes separated by a single
 * hairline: the history sits on a darker ground so it recedes, and the
 * conversation takes the light.
 */
export default function AssistantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col flex-1 w-full min-h-0">
      <Header />
      <div className="flex flex-1 overflow-hidden min-h-0 -mx-8 -mb-8">
        <aside className="w-[248px] flex-shrink-0 hidden md:flex flex-col bg-black/[0.14] dark:bg-black/[0.18] border-r border-border-dim px-4 py-5 relative overflow-hidden z-20">
          <ChatHistoryList />
        </aside>

        <main className="flex-1 flex flex-col relative overflow-hidden z-20 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
