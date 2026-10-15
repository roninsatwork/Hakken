"use client";

import { ClassificationTypeEditor } from "../ClassificationTypeEditor";

/** A new type, on a page of its own — it has fields, so never a pop-up (classification-types-plan.md, CT3). */
export default function NewClassificationTypePage() {
  return <ClassificationTypeEditor typeKey={null} />;
}
