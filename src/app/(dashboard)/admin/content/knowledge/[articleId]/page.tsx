"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { ArticleEditor } from "../ArticleEditor";

/** Admin → Content → Knowledge → an article, on its own page. */
export default function EditKnowledgeArticlePage() {
  const params = useParams();
  return <ArticleEditor articleId={params.articleId as Id<"knowledgeArticles">} />;
}
