import { Bricolage_Grotesque } from "next/font/google";
import "../(public)/public.css";

/**
 * Sign-in shares the public site's type and tokens, so the page a visitor
 * lands on from the marketing site does not change identity underneath them.
 * A layout rather than the page itself because next/font loaders belong in a
 * server component, and the page is a client component.
 */
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
});

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={bricolage.variable}>{children}</div>;
}
