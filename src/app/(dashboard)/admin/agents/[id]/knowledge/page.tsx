"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { Id } from "@/convex/_generated/dataModel";
import { Library, CheckCircle, Upload, AlertTriangle, UploadCloud, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/src/ui/lib/utils";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";

export default function AgentKnowledgePage() {
  const params = useParams();
  const agentId = params.id as Id<"agents">;
  
  const agent = useQuery(api.agents.get, { id: agentId });
  const availableKnowledge = useQuery(api.knowledge.getDocuments, { agentId }) || [];
  
  const generateUploadUrl = useMutation(api.knowledge.generateUploadUrl);
  const saveDocument = useMutation(api.knowledge.saveDocument);
  const deleteDocument = useMutation(api.knowledge.deleteDocument);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorDetails, setErrorDetails] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [activeDeletion, setActiveDeletion] = useState<string | null>(null);
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
        storageId,
        title: file.name,
        format: file.type,
        agentId: agentId
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

  if (agent === undefined) return null;

  return (
    <>
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300 w-full h-full antialiased">
      
      {/* Grand Header Matching Screenshot */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
        <div>
          <h2 className="text-[18px] font-semibold text-foreground tracking-tight flex items-center gap-2">
            <Library className="w-5 h-5 text-brand" />
            Agent Intelligence Base
          </h2>
          <p className="text-[13px] text-secondary mt-1">View and manage documents uploaded exclusively for this agent.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 rounded-[8px] bg-white text-black text-[13px] font-medium hover:bg-white/90 transition-all flex items-center gap-2"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload Document
          </button>
        </div>
      </div>

      {availableKnowledge.length === 0 ? (
        <div className="w-full flex-1 min-h-[400px] border border-border-dim bg-white/[0.02] rounded-[16px] flex flex-col items-center justify-center gap-4">
           <Library className="w-10 h-10 text-brand opacity-60" />
           <div className="text-center flex flex-col items-center gap-1">
             <span className="text-[16px] font-semibold text-foreground tracking-tight">No Active Knowledge</span>
             <span className="text-secondary text-[13px]">Upload documents in the main Knowledge Hub to empower agents dynamically.</span>
           </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
            {availableKnowledge.map((doc: any) => {
              return (
                <div key={doc._id} className="flex items-center gap-4 px-5 py-4 border rounded-[12px] bg-black/20 border-border-dim w-full group">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                    <Library className="w-4 h-4 text-muted" />
                  </div>
                  
                  <div className="flex flex-col flex-1 gap-1">
                    <span className="text-[14px] font-semibold text-foreground tracking-tight">{doc.title}</span>
                    <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-secondary">
                      <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                      <span className="opacity-40">•</span>
                      <span className="font-mono uppercase tracking-widest text-[10px]">{doc.format}</span>
                    </div>
                  </div>
                  
                  <div className="ml-auto flex items-center gap-3">
                    <span className={cn(
                      "text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-full flex items-center gap-1.5 border",
                      doc.status === 'ready' ? "text-green-500 border-green-500/20 bg-green-500/10" : "text-muted border-border-dim bg-white/5"
                    )}>
                      {doc.status === 'ready' && <CheckCircle className="w-3 h-3"/>}
                      {doc.status}
                    </span>
                    
                    <button 
                       onClick={async () => {
                          if (confirm("Permanently delete this intelligence source?")) {
                             setActiveDeletion(doc._id);
                             try {
                               await deleteDocument({ documentId: doc._id });
                             } catch(err: any) {
                               alert(err.message);
                             } finally {
                               setActiveDeletion(null);
                             }
                          }
                       }}
                       disabled={activeDeletion === doc._id}
                       className="p-1.5 rounded-md hover:bg-red-500/10 text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                    >
                       {activeDeletion === doc._id ? <Loader2 className="w-4 h-4 animate-spin text-red-400" /> : <Trash2 className="w-4 h-4"/>}
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>

    {/* Upload Drag & Drop Modal */}
    <SonaeModal
      isOpen={isModalOpen}
      onClose={() => !isUploading && setIsModalOpen(false)}
      title="Upload Intelligence Document"
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
                  <p className="text-[14px] font-bold text-foreground">Securely Uploading Core Intelligence...</p>
               </div>
            ) : (
               <div className="flex flex-col flex-1 items-center justify-center pointer-events-none">
                  <UploadCloud className={`w-12 h-12 mb-4 transition-colors ${dragActive ? 'text-brand scale-110' : 'text-secondary'}`} />
                  <p className="text-[14px] font-bold text-foreground mb-1">Drag & Drop Documentation</p>
                  <p className="text-[13px] text-muted text-center max-w-[250px] leading-relaxed mb-6">
                     Supports securely encrypted .PDF, .DOCX, and .TXT extraction.
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
