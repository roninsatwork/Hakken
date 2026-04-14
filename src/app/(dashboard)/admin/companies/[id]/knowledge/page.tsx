"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useParams } from "next/navigation";
import { FileText, Upload, Loader2, Trash2, CheckCircle2, AlertTriangle, UploadCloud } from "lucide-react";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";

export default function CompanyKnowledgeBasePage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  
  const documents = useQuery(api.knowledge.getDocuments, { companyId });
  const generateUploadUrl = useMutation(api.knowledge.generateUploadUrl);
  const saveDocument = useMutation(api.knowledge.saveDocument);
  const deleteDocument = useMutation(api.knowledge.deleteDocument);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorDetails, setErrorDetails] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    if (!["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"].includes(file.type)) {
       setErrorDetails("Unsupported file type. Please upload a PDF, DOCX, or TXT file.");
       return;
    }

    setIsUploading(true);
    setErrorDetails("");

    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await result.json();

      await saveDocument({
        companyId,
        storageId,
        title: file.name,
        format: file.type,
      });
      setIsModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setErrorDetails(err.message || "Failed to upload file.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0]);
    }
  };

  return (
    <>
    <div className="flex flex-col gap-6 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium tracking-tight">Knowledge Base</h2>
          <p className="text-secondary text-[13px] mt-1">Upload company policies, handbooks, and operations manuals to empower Sonae's responses.</p>
        </div>
        <button 
           onClick={() => setIsModalOpen(true)}
           className="h-9 px-4 rounded-[10px] bg-foreground text-background font-medium text-[13px] flex items-center gap-2 hover:opacity-90 transition-all"
        >
          <Upload className="w-3.5 h-3.5" />
          Upload Document
        </button>
      </div>
      
      {errorDetails && (
         <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-sm flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4" />
            {errorDetails}
         </div>
      )}

      {documents === undefined ? (
        <div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 px-6 text-center border border-border-dim/50 border-dashed rounded-[16px] bg-foreground/[0.02]">
          <FileText className="w-10 h-10 text-brand mb-4 opacity-80" />
          <h3 className="text-sm font-medium text-foreground mb-1">No Documents Uploaded</h3>
          <p className="text-[13px] text-secondary max-w-sm">
            Upload PDF or DOCX files so the AI can securely learn about this company.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 mt-2">
          {documents.map((doc) => (
            <div key={doc._id} className="p-4 rounded-[12px] bg-sidebar/50 border border-border-dim flex items-center justify-between group">
               <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-foreground/5 flex items-center justify-center text-secondary">
                     <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col gap-1">
                     <h4 className="text-[14px] font-bold text-foreground">{doc.title}</h4>
                     <div className="flex items-center gap-2 text-[12px] text-muted font-mono tracking-wide">
                        <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                        <span>•</span>
                        <span className="uppercase">{doc.format?.split('/').pop()?.replace('vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx')}</span>
                     </div>
                  </div>
               </div>
               
               <div className="flex items-center gap-4">
                  {doc.status === "processing" && (
                    <div className="flex items-center gap-2 text-[11px] font-bold text-amber-500 tracking-widest uppercase font-mono px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30">
                       <Loader2 className="w-3.5 h-3.5 animate-spin" /> Ingesting
                    </div>
                  )}
                  {doc.status === "ready" && (
                     <div className="flex items-center gap-2 text-[11px] font-bold text-[#10b981] tracking-widest uppercase font-mono px-3 py-1.5 rounded-full bg-[#10b981]/10 border border-[#10b981]/30">
                       <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                     </div>
                  )}
                  {doc.status === "failed" && (
                     <div className="flex items-center gap-2 text-[11px] font-bold text-red-500 tracking-widest uppercase font-mono px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/30">
                       <AlertTriangle className="w-3.5 h-3.5" /> Failed
                     </div>
                  )}

                  <button
                    onClick={() => deleteDocument({ documentId: doc._id })}
                    className="p-2 rounded-lg border border-transparent text-secondary hover:text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete Document"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
               </div>
            </div>
          ))}
        </div>
      )}
    </div>

    <SonaeModal
      isOpen={isModalOpen}
      onClose={() => setIsModalOpen(false)}
      title="Upload Knowledge Document"
      size="md"
    >
      <div className="flex flex-col gap-6 w-full pt-4">
        {errorDetails && (
           <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-[13px] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium">{errorDetails}</span>
           </div>
        )}

        <div 
           className={`relative border-2 border-dashed rounded-[16px] flex flex-col items-center justify-center p-12 transition-all ${dragActive ? 'border-brand bg-brand/5 scale-[1.02]' : 'border-white/10 bg-black/20 hover:border-white/20 hover:bg-black/40'} ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
           onDragEnter={handleDrag}
           onDragLeave={handleDrag}
           onDragOver={handleDrag}
           onDrop={handleDrop}
        >
            <input 
               ref={inputRef}
               type="file"
               accept=".pdf,.docx,.txt"
               onChange={handleChange}
               className="hidden"
            />
            {isUploading ? (
               <div className="flex flex-col flex-1 items-center justify-center pointer-events-none">
                  <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
                  <p className="text-[14px] font-bold text-foreground">Securely Uploading Document...</p>
               </div>
            ) : (
               <div className="flex flex-col flex-1 items-center justify-center pointer-events-none">
                  <UploadCloud className={`w-12 h-12 mb-4 transition-colors ${dragActive ? 'text-brand scale-110' : 'text-secondary'}`} />
                  <p className="text-[14px] font-bold text-foreground mb-1">Drag & Drop Documentation</p>
                  <p className="text-[13px] text-muted text-center max-w-[250px] leading-relaxed mb-6">
                     Supports .PDF, .DOCX, and .TXT format.
                  </p>
                  <button 
                     onClick={(e) => { e.preventDefault(); inputRef.current?.click(); }}
                     className="px-6 py-2.5 rounded-full bg-foreground text-background font-bold tracking-wide text-[13px] hover:opacity-90 transition-all pointer-events-auto shadow-[0_0_20px_rgba(255,255,255,0.05)]"
                  >
                     Browse Desktop Files
                  </button>
               </div>
            )}
        </div>
      </div>
    </SonaeModal>
    </>
  );
}
