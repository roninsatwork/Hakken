// The drawing kit renders parts outside Next: a link is a plain <a>.
import type { AnchorHTMLAttributes, ReactNode } from "react";

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string; children?: ReactNode; prefetch?: unknown; replace?: unknown; scroll?: unknown };

export default function Link({ href, children, prefetch: _prefetch, replace: _replace, scroll: _scroll, ...props }: LinkProps) {
  return <a href={href} {...props}>{children}</a>;
}
