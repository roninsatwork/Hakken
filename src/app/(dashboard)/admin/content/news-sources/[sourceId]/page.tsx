"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { SourceEditor } from "../SourceEditor";

/** Admin → Content → News sources → a source, on its own page. */
export default function EditNewsSourcePage() {
  const params = useParams();
  return <SourceEditor sourceId={params.sourceId as Id<"newsSources">} />;
}
