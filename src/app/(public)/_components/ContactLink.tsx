import Link from "next/link";

/**
 * Every "talk to us" on the public site goes through here.
 *
 * The destination is deployment configuration, never a hardcoded URL — a
 * builder-owned domain baked into the source is inherited by every deployment
 * made from this repo, which is what `no-client-specific-fallbacks.test.ts`
 * exists to prevent. Set `NEXT_PUBLIC_CONTACT_URL` to send enquiries somewhere
 * external; leave it unset and these fall back to the in-app /contact page.
 */
const CONTACT_URL = process.env.NEXT_PUBLIC_CONTACT_URL;

export function ContactLink({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  if (CONTACT_URL) {
    return (
      <a
        href={CONTACT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href="/contact" className={className}>
      {children}
    </Link>
  );
}
