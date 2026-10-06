"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { TopicEditor } from "../TopicEditor";

/** Admin → Content → Topics → a topic, on its own page. */
export default function EditTopicPage() {
  const params = useParams();
  return <TopicEditor topicId={params.topicId as Id<"topics">} />;
}
