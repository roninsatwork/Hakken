"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { LibraryArticleEditor } from "../LibraryArticleEditor";

/** Admin → Content → Library → an article, on its own page (content-library-plan.md, board 3). */
export default function EditLibraryArticlePage() {
  const params = useParams();
  return <LibraryArticleEditor articleId={params.articleId as Id<"libraryArticles">} />;
}
