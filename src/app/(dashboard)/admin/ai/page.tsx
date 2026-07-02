import { redirect } from "next/navigation";

export default function GlobalAiPage() {
  redirect("/admin/ai/usage/costs");
}
