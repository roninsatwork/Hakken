"use client";

import {
  AdminModalFormField,
  adminModalInputClassName,
  adminModalTextareaClassName,
} from "@/src/app/(dashboard)/admin/_components/AdminModalForm";

export type MemoryCategory = "FACT" | "PREFERENCE" | "POSITIONING" | "TONE" | "BOUNDARY" | "SALES" | "SUPPORT" | "OTHER";

export const MEMORY_CATEGORIES: Array<{ value: MemoryCategory; label: string }> = [
  { value: "FACT", label: "Fact" },
  { value: "PREFERENCE", label: "Preference" },
  { value: "POSITIONING", label: "Positioning" },
  { value: "TONE", label: "Tone" },
  { value: "BOUNDARY", label: "Boundary" },
  { value: "SALES", label: "Sales" },
  { value: "SUPPORT", label: "Support" },
  { value: "OTHER", label: "Other" },
];

export type CompanyMemoryFormData = {
  title: string;
  content: string;
  category: MemoryCategory;
  confidence: string;
  reason: string;
};

type CompanyMemoryFormFieldsProps = {
  formData: CompanyMemoryFormData;
  setFormData: (updater: (current: CompanyMemoryFormData) => CompanyMemoryFormData) => void;
  showReason?: boolean;
  titleHint?: string;
};

export function CompanyMemoryFormFields({
  formData,
  setFormData,
  showReason = false,
  titleHint,
}: CompanyMemoryFormFieldsProps) {
  return (
    <>
      <AdminModalFormField label="Title" hint={titleHint}>
        <input
          type="text"
          value={formData.title}
          onChange={(event) => setFormData((current) => ({ ...current, title: event.target.value }))}
          className={adminModalInputClassName}
          placeholder="Public widget boundary"
        />
      </AdminModalFormField>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px]">
        <AdminModalFormField label="Category">
          <select
            value={formData.category}
            onChange={(event) => setFormData((current) => ({ ...current, category: event.target.value as MemoryCategory }))}
            className={adminModalInputClassName}
          >
            {MEMORY_CATEGORIES.map((category) => (
              <option key={category.value} value={category.value}>{category.label}</option>
            ))}
          </select>
        </AdminModalFormField>
        <AdminModalFormField label="Confidence" hint="0 to 1">
          <input
            type="number"
            min="0"
            max="1"
            step="0.01"
            value={formData.confidence}
            onChange={(event) => setFormData((current) => ({ ...current, confidence: event.target.value }))}
            className={adminModalInputClassName}
          />
        </AdminModalFormField>
      </div>
      <AdminModalFormField label="Content" hint="Stored as governed company context">
        <textarea
          required
          value={formData.content}
          onChange={(event) => setFormData((current) => ({ ...current, content: event.target.value }))}
          className={`${adminModalTextareaClassName} min-h-[260px]`}
          placeholder="Describe the durable fact, preference, or boundary."
        />
      </AdminModalFormField>
      {showReason && (
        <AdminModalFormField label="Reason" hint="Optional review note">
          <textarea
            value={formData.reason}
            onChange={(event) => setFormData((current) => ({ ...current, reason: event.target.value }))}
            className={`${adminModalTextareaClassName} min-h-[180px]`}
            placeholder="Why should this become durable memory?"
          />
        </AdminModalFormField>
      )}
    </>
  );
}

