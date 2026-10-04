/**
 * Learn's three parts, behind one menu item (knowledge-news-and-digest-plan.md,
 * revised again 2026-10-01, R4). The menu lights Learn on them and the top bar
 * names them Learn.
 */
const LEARN_PATHS = ["/app/news", "/app/knowledge", "/app/who-to-follow"];

export function isLearnPath(pathname: string) {
  return LEARN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
