"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { FollowEditor } from "../../FollowEditor";

/** Admin → Content → Who to follow → a person → Edit details, on its own page. */
export default function EditFollowPage() {
  const params = useParams();
  return <FollowEditor followId={params.followId as Id<"newsFollows">} />;
}
