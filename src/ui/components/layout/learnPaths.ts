/**
 * Reading room's four parts — News, Knowledge, Who to follow and Helpful content —
 * behind one menu item (knowledge-news-and-digest-plan.md, revised again
 * 2026-10-01, R4; renamed Insights by insights-helpful-content-plan.md, IH18,
 * then Reading room by menu-names-plan.md). The menu lights Reading room on
 * them and the top bar names them Reading room. The code
 * keeps its name, Learn, as "knowledge articles" kept theirs.
 */
const LEARN_PATHS = ["/app/news", "/app/knowledge", "/app/who-to-follow", "/app/helpful-content"];

export function isLearnPath(pathname: string) {
  return LEARN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
