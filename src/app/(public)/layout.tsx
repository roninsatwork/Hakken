import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { cn } from "@/src/ui/lib/utils";
import { PublicNav } from "./_components/PublicNav";
import { PublicFooter } from "./_components/PublicFooter";
import { PublicMotion } from "./_motion/PublicMotion";
import "./public.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
});

export const metadata: Metadata = {
  title: {
    default: "Hakken — Launch AI products, not AI experiments",
    template: "%s · Hakken",
  },
  description:
    "Hakken is everything underneath an AI product — knowledge, approvals, cost control, a record of what the AI actually did — already built, so you start on the part your customers care about.",
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn(bricolage.variable, "public-site flex min-h-screen w-full flex-col")}>
      <PublicMotion />
      <PublicNav />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}
