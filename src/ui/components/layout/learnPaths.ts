/**
 * Insights' four parts — News, Knowledge, Who to follow and Helpful content —
 * behind one menu item (knowledge-news-and-digest-plan.md, revised again
 * 2026-10-01, R4; renamed by insights-helpful-content-plan.md, IH18). The
 * menu lights Insights on them and the top bar names them Insights. The code
 * keeps its name, Learn, as "knowledge articles" kept theirs.
 */
const LEARN_PATHS = ["/app/news", "/app/knowledge", "/app/who-to-follow", "/app/helpful-content"];

export function isLearnPath(pathname: string) {
  return LEARN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
