import Header from "@/src/ui/components/layout/Header";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col flex-1 h-full min-h-[calc(100vh-64px)] w-full relative">
      <Header />
      <main className="flex-1 flex flex-col items-stretch relative">
        {children}
      </main>
    </div>
  );
}
