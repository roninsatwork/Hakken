"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { LibraryArticleEditor } from "../../LibraryArticleEditor";

/** Admin → Content → Knowledge → an article kept from the web, on its own page (content-people-knowledge-plan.md, board 6). */
export default function EditWebKnowledgeArticlePage() {
  const params = useParams();
  return <LibraryArticleEditor articleId={params.articleId as Id<"libraryArticles">} />;
}
