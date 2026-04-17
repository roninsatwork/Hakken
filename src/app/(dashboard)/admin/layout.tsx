"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Header from "@/src/ui/components/layout/Header";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const user = useQuery(api.users.getMe);

  useEffect(() => {
    if (user !== undefined && user?.role !== "SUPER_ADMIN") {
      router.push("/app");
    }
  }, [user, router]);

  if (user === undefined) return null; // Or a loading spinner

  return (
    <div className="flex flex-col flex-1 h-full min-h-[calc(100vh-64px)] w-full relative">
      <Header />
      <main className="flex-1 flex flex-col items-stretch relative">
        {children}
      </main>
    </div>
  );
}
