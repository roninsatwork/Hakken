"use client";

import React, { useState, useEffect } from "react";
import Header from "@/src/ui/components/layout/Header";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { UserCircle, Save, CheckCircle, Activity } from "lucide-react";
import ProfileTabs from "./ProfileTabs";
import { useTranslations } from "next-intl";
import Image from "next/image";
import type { Id } from "@/convex/_generated/dataModel";
import { Field } from "@/src/ui/components/screens/Field";

type ProfileFormData = {
  name: string;
  email: string;
  phone: string;
  image: string;
  storageId: Id<"_storage"> | "";
};

export default function MyProfilePage() {
  const t = useTranslations('user.profile');

  const user = useQuery(api.users.getMe);
  const updateProfile = useMutation(api.users.updateMyProfile);
  const generateUploadUrl = useMutation(api.users.generateUploadUrl);

  const imageInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [formData, setFormData] = useState<ProfileFormData>({
    name: "",
    email: "",
    phone: "",
    image: "",
    storageId: "",
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const planStatus = useQuery(api.plans.getMyCompanyPlanStatus);

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || "",
        email: user.email || "",
        phone: user.phone || "",
        image: user.image || "",
        storageId: "",
      });
    }
  }, [user]);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const { validateUploadFile } = await import("@/src/lib/constants/uploads");
    const validation = validateUploadFile(file, "adminImage");
    if (!validation.allowed) return;

    setIsUploading(true);
    try {
      // 1. Get short-lived upload URL from Convex
      const postUrl = await generateUploadUrl();

      // 2. POST the file to the URL
      const result = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await result.json() as { storageId: Id<"_storage"> };

      // 3. Save the storage ID to form state and generate a local preview URL
      const localPreviewUrl = URL.createObjectURL(file);
      setFormData({ ...formData, storageId, image: localPreviewUrl });
    } catch (error) {
      console.error("Upload failed", error);
    } finally {
      setIsUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      await updateProfile({
        name: formData.name,
        phone: formData.phone,
        image: formData.image,
        ...(formData.storageId ? { storageId: formData.storageId } : {}),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to update profile", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col">
      <Header />

      {/* Main Content Area */}
      <div className="flex flex-col gap-5 pb-8">
        {/* Header Section */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <UserCircle className="w-6 h-6 text-brand" />
              My Profile
            </h1>
            <p className="text-[13px] text-secondary mt-1">Manage your identity and personal preferences.</p>
          </div>

          <div className="flex items-center gap-4">
            {saveSuccess && (
              <div className="flex items-center gap-2 text-[#10b981] text-[13px] font-medium animate-in fade-in slide-in-from-right-2 duration-300">
                <CheckCircle className="w-4 h-4" />
                <span>{t('saved')}</span>
              </div>
            )}
            <button
              form="profile-form"
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 rounded-[10px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all text-[13px] flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-[14px] h-[14px]" />
              {isSaving ? t('saving') : t('saveChanges')}
            </button>
          </div>
        </header>

        {/* Form Container */}
        <div className="w-full mt-2">

          <form id="profile-form" onSubmit={handleSubmit} className="relative z-10 flex flex-col gap-6">

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-4xl">
              <Field
                label={t('fields.name.label')}
                required
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('fields.name.placeholder')}
              />

              {/* The badge that used to sit at the right-hand end of the label
                  row said the same thing as the sentence underneath, so the
                  sentence keeps the job and the box being visibly switched off
                  says the rest. */}
              <Field
                label={t('fields.email.label')}
                hint={t('fields.email.description')}
                type="email"
                disabled
                value={formData.email}
                placeholder="you@example.com"
                className="cursor-not-allowed opacity-70"
              />

              <Field
                label={t('fields.phone.label')}
                type="tel"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                placeholder={t('fields.phone.placeholder')}
              />

              <div className="flex flex-col gap-1.5 w-full">
                <span className="mt-1 text-[12px] font-medium text-secondary">{t('fields.photo.label')}</span>
                <div className="flex items-center gap-4 w-full h-full pb-1">
                  {formData.image ? (
                    <Image
                      src={formData.image}
                      alt="Avatar Preview"
                      width={44}
                      height={44}
                      unoptimized
                      className="w-11 h-11 rounded-full object-cover border border-white/10 shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full border border-dashed border-white/20 flex items-center justify-center bg-white/5 shrink-0">
                      <UserCircle className="w-5 h-5 text-muted" />
                    </div>
                  )}
                  <div className="flex flex-col items-start gap-1">
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={isUploading}
                      className="px-3 py-1.5 rounded-[8px] bg-foreground/10 text-foreground text-[12px] font-medium hover:bg-foreground/20 transition-all disabled:opacity-50"
                    >
                      {isUploading ? t('fields.photo.uploading') : t('fields.photo.upload')}
                    </button>
                    <p className="text-[10px] text-secondary">{t('fields.photo.hint')}</p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    ref={imageInputRef}
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </div>
              </div>
            </div>

          </form>
        </div>

        {/* Company AI Usage Tracker */}
        {planStatus && (
          <div className="w-full mt-4 bg-sidebar/30 border border-border-dim rounded-[16px] p-6 shadow-sm overflow-hidden relative">
            <div className="flex items-center justify-between mb-4 relative z-10">
              <div className="flex items-center gap-3 w-full">
                <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center shrink-0 border border-brand/20">
                  <Activity className="w-5 h-5 text-brand" />
                </div>
                <div className="flex flex-col flex-1">
                  <div className="flex justify-between items-end w-full">
                    <span className="text-[14px] font-bold tracking-wide text-foreground">AI Messaging Pool</span>
                    <span className="text-[12px] font-mono font-medium text-foreground">
                      {planStatus.messagesUsed.toLocaleString()} / {planStatus.messageLimit === -1 ? 'Unlimited' : planStatus.messageLimit.toLocaleString()}
                    </span>
                  </div>
                  <span className="text-[12px] text-secondary mt-0.5 tracking-wide">
                    Plan: <span className="text-foreground/80 font-medium">{planStatus.planName}</span> (Resets monthly)
                  </span>
                </div>
              </div>
            </div>

            {planStatus.messageLimit !== -1 && (
              <div className="relative w-full h-2 rounded-full overflow-hidden bg-background border border-border-dim/50 z-10 shadow-inner">
                <div 
                  className={`absolute top-0 bottom-0 left-0 bg-brand/80 transition-all duration-1000 ease-out`}
                  style={{ width: `${Math.min((planStatus.messagesUsed / planStatus.messageLimit) * 100, 100)}%` }}
                />
              </div>
            )}
            {planStatus.messageLimit !== -1 && (planStatus.messagesUsed >= planStatus.messageLimit) && (
              <p className="text-[11px] text-red-500 mt-2 font-medium z-10 relative">Usage limit reached. All non-critical AI interactions are paused until the next billing cycle.</p>
            )}
          </div>
        )}

        {/* Profile Tabs Section */}
        <ProfileTabs />

      </div>
    </div>
  );
}
