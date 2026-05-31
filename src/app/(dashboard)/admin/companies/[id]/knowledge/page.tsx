"use client";

import { useState, useRef, useMemo } from "react";
import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useParams } from "next/navigation";
import { FileText, Upload, Loader2, Trash2, CheckCircle2, AlertTriangle, UploadCloud, Globe, AlignLeft, ChevronDown, ChevronUp, Search, RefreshCw, AlertCircle } from "lucide-react";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function CompanyKnowledgeBasePage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  
  const documents = useQuery(api.knowledge.getDocuments, { companyId }) as Doc<"knowledgeDocuments">[] | undefined;
  const generateUploadUrl = useMutation(api.knowledge.generateUploadUrl);
  const saveDocument = useMutation(api.knowledge.saveDocument);
  const deleteDocument = useMutation(api.knowledge.deleteDocument);
  
  const saveManualText = useMutation(api.knowledge.saveManualText);
  const queueWebsiteUrls = useMutation(api.knowledge.queueWebsiteUrls);
  const deleteWebsiteBulk = useMutation(api.knowledge.deleteWebsiteBulk);
  const mapWebsite = useAction(api.knowledgeActions.mapWebsite);

  const [activeTab, setActiveTab] = useState<"Website" | "File" | "Text">("Website");

  // File State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Text State
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  const [isSavingText, setIsSavingText] = useState(false);

  // Website State
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [isMapping, setIsMapping] = useState(false);
  const [mappedUrls, setMappedUrls] = useState<string[]>([]);
  const [isQueueing, setIsQueueing] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  
  // Website Bulk Action States
  const [refreshingRoots, setRefreshingRoots] = useState<Record<string, boolean>>({});
  const [rootToDelete, setRootToDelete] = useState<string | null>(null);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [websiteError, setWebsiteError] = useState("");

  const processFile = async (file: File) => {
    if (!["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain", "text/csv"].includes(file.type)) {
       setFileError("Unsupported file type. Please upload a PDF, DOCX, TXT, or CSV file.");
       return;
    }

    setIsUploading(true);
    setFileError("");

    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await result.json() as { storageId: Id<"_storage"> };

      await saveDocument({
        companyId,
        storageId,
        title: file.name,
        format: file.type,
      });
      setIsModalOpen(false);
    } catch (err: unknown) {
      console.error(err);
      setFileError(getErrorMessage(err, "Failed to upload file."));
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrag = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0]);
    }
  };

  const handleSaveText = async () => {
      if (!textTitle.trim() || !textContent.trim()) return;
      setIsSavingText(true);
      try {
         await saveManualText({ companyId, title: textTitle.trim(), textContent: textContent.trim() });
         setTextTitle("");
         setTextContent("");
         setActiveTab("File"); // Navigate away or just show success
      } catch (e) {
         console.error(e);
      } finally {
         setIsSavingText(false);
      }
  };

  const handleMapUrl = async (e: KeyboardEvent<HTMLInputElement>) => {
     if (e.key === "Enter" && websiteUrl.trim()) {
         e.preventDefault();
         setIsMapping(true);
         setMappedUrls([]);
         setWebsiteError("");
         try {
             let cleanedUrl = websiteUrl.trim();
             if (!cleanedUrl.startsWith("http")) cleanedUrl = "https://" + cleanedUrl;
             const links = await mapWebsite({ url: cleanedUrl });
             setMappedUrls(links);
         } catch (err: unknown) {
             console.error("Map error", err);
             setWebsiteError(getErrorMessage(err, "Failed to map website. Check API keys and network."));
         } finally {
             setIsMapping(false);
         }
     }
  };

  const handleQueueMappedUrls = async () => {
      if (mappedUrls.length === 0) return;
      setIsQueueing(true);
      setWebsiteError("");
      try {
          await queueWebsiteUrls({ companyId, urls: mappedUrls });
          setMappedUrls([]);
          setWebsiteUrl("");
      } catch (err: unknown) {
          console.error(err);
          setWebsiteError("Failed to queue URLs.");
      } finally {
          setIsQueueing(false);
      }
  };

  const handleRefreshRoot = async (root: string) => {
      setRefreshingRoots(prev => ({...prev, [root]: true}));
      setWebsiteError("");
      try {
          const links = await mapWebsite({ url: root });
          await queueWebsiteUrls({ companyId, urls: links, forceRefresh: true });
      } catch (err: unknown) {
          console.error("Refresh error", err);
          setWebsiteError(`Failed to refresh ${root}: ${getErrorMessage(err, "Unknown error")}`);
      } finally {
          setRefreshingRoots(prev => ({...prev, [root]: false}));
      }
  };

  const handleConfirmBulkDelete = async () => {
      if (!rootToDelete) return;
      setIsDeletingBulk(true);
      try {
          await deleteWebsiteBulk({ companyId, rootDomain: rootToDelete });
          setRootToDelete(null);
      } catch (err: unknown) {
          console.error(err);
          setWebsiteError("Failed to rigidly delete website root.");
      } finally {
          setIsDeletingBulk(false);
      }
  };

  // Group website documents by their origin domain
  const websiteGroups = useMemo(() => {
     if (!documents) return {};
     const groups: Record<string, Doc<"knowledgeDocuments">[]> = {};
     documents.forEach(doc => {
         if (doc.format === "url" && doc.sourceUrl) {
            try {
               const root = new URL(doc.sourceUrl).origin;
               if (!groups[root]) groups[root] = [];
               groups[root].push(doc);
            } catch {
               if (!groups["Other"]) groups["Other"] = [];
               groups["Other"].push(doc);
            }
         }
     });
     return groups;
  }, [documents]);

  const toggleGroup = (root: string) => {
     setExpandedGroups(prev => ({ ...prev, [root]: !prev[root] }));
  };

  return (
    <>
    <div className="flex flex-col gap-6 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium tracking-tight">AI Knowledge</h2>
          <p className="text-secondary text-[13px] mt-1">Connect different data sources for the agent knowledgebase</p>
        </div>
      </div>

      <div className="flex items-center bg-background border border-border-dim rounded-[10px] w-fit p-1">
          <button 
             onClick={() => setActiveTab("Website")}
             className={`px-8 py-2 text-[13px] font-medium rounded-md transition-colors ${activeTab === "Website" ? "bg-brand text-white shadow-sm" : "text-secondary hover:text-foreground"}`}
          >
             Website
          </button>
          <button 
             onClick={() => setActiveTab("File")}
             className={`px-8 py-2 text-[13px] font-medium rounded-md transition-colors ${activeTab === "File" ? "bg-brand text-white shadow-sm" : "text-secondary hover:text-foreground"}`}
          >
             File
          </button>
          <button 
             onClick={() => setActiveTab("Text")}
             className={`px-8 py-2 text-[13px] font-medium rounded-md transition-colors ${activeTab === "Text" ? "bg-brand text-white shadow-sm" : "text-secondary hover:text-foreground"}`}
          >
             Text
          </button>
      </div>
      
      {/* TEXT TAB */}
      {activeTab === "Text" && (
         <div className="bg-sidebar/30 border border-border-dim rounded-[16px] p-6">
            <h3 className="text-sm font-bold mb-4">Text</h3>
            <div className="flex flex-col gap-4">
                <input 
                   type="text"
                   value={textTitle}
                   onChange={(e) => setTextTitle(e.target.value)}
                   placeholder="Enter title"
                   className="w-full bg-background border border-border-dim rounded-[8px] px-4 py-3 text-[14px] text-foreground focus:outline-none focus:border-brand transition-colors"
                />
                <textarea 
                   value={textContent}
                   onChange={(e) => setTextContent(e.target.value)}
                   placeholder="+ Insert text here"
                   rows={6}
                   className="w-full bg-background border border-border-dim rounded-[8px] px-4 py-3 text-[13px] text-foreground focus:outline-none focus:border-brand transition-colors resize-y"
                />
                <div className="flex justify-end">
                    <button 
                       onClick={handleSaveText}
                       disabled={isSavingText || !textTitle.trim() || !textContent.trim()}
                       className="h-10 px-6 rounded-[8px] bg-secondary text-background font-medium text-[13px] hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                       {isSavingText ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                       Add text
                    </button>
                </div>
            </div>
         </div>
      )}

      {/* WEBSITE TAB */}
      {activeTab === "Website" && (
         <div className="flex flex-col gap-6">
            <div className="bg-sidebar/30 border border-border-dim rounded-[16px] p-6">
                <h3 className="text-sm font-bold mb-4">Website URL</h3>
                {websiteError && (
                   <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-[13px] flex items-center gap-2">
                       <AlertCircle className="w-4 h-4 flex-shrink-0" />
                       <span className="font-medium">{websiteError}</span>
                   </div>
                )}
                <div className="relative">
                   <input 
                      type="text"
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      onKeyDown={handleMapUrl}
                      placeholder="+Add website URL and press Enter"
                      disabled={isMapping || isQueueing}
                      className="w-full bg-background border border-border-dim rounded-[8px] px-4 py-3 text-[14px] text-foreground focus:outline-none focus:border-[#10b981] transition-colors pr-10"
                   />
                   {isMapping ? (
                      <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#10b981] animate-spin" />
                   ) : (
                      <CheckCircle2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#10b981] scale-x-[-1]" />
                   )}
                </div>

                {mappedUrls.length > 0 && (
                   <div className="mt-4 flex flex-col gap-3">
                      <div className="flex items-center justify-between text-[13px] text-secondary">
                         <span>Found {mappedUrls.length} pages to scrape</span>
                         <button 
                            onClick={handleQueueMappedUrls}
                            disabled={isQueueing}
                            className="bg-brand text-white px-4 py-1.5 rounded-md font-medium hover:bg-brand/90 transition flex items-center gap-2"
                         >
                            {isQueueing ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : null}
                            Queue All for Training
                         </button>
                      </div>
                      <div className="max-h-[300px] overflow-y-auto border border-border-dim rounded-[8px] bg-background text-[12px]">
                         {mappedUrls.map((u, i) => (
                             <div key={i} className="py-2 px-3 border-b border-border-dim/50 last:border-0 truncate ext-muted">
                                {u}
                             </div>
                         ))}
                      </div>
                   </div>
                )}
            </div>

            <div className="flex flex-col gap-4">
               <h3 className="text-[11px] font-bold tracking-widest text-secondary uppercase">Trained</h3>
               
               {Object.entries(websiteGroups).map(([root, docs]) => {
                   const isExpanded = expandedGroups[root];
                   const totalDocs = docs.length;
                   const readyDocs = docs.filter(d => d.status === "ready").length;
                   const progressPct = totalDocs > 0 ? Math.round((readyDocs / totalDocs) * 100) : 0;
                   const isRefreshing = refreshingRoots[root];

                   return (
                      <div key={root} className="flex flex-col border border-border-dim rounded-[12px] bg-sidebar/30 overflow-hidden">
                         <div className="flex items-center justify-between p-4 bg-background/50">
                             <div className="flex items-center gap-4">
                                 <Globe className="w-4 h-4 text-secondary" />
                                 <div className="flex flex-col gap-0.5">
                                     <span className="text-[14px] font-medium text-foreground">{root}</span>
                                     <div className="flex items-center gap-2 text-[11px] text-secondary">
                                         <div className="w-24 h-1.5 bg-border-dim rounded-full overflow-hidden">
                                            <div className="h-full bg-brand transition-all duration-500 ease-in-out" style={{ width: `${progressPct}%` }} />
                                         </div>
                                         <span className="font-mono tracking-wide">{readyDocs}/{totalDocs} Ready ({progressPct}%)</span>
                                     </div>
                                 </div>
                             </div>
                             <div className="flex items-center gap-3">
                                 <button
                                    onClick={() => handleRefreshRoot(root)}
                                    disabled={isRefreshing}
                                    title="Bulk Refresh (Re-scrape & find new)"
                                    className="p-1.5 rounded-lg text-secondary hover:text-brand hover:bg-brand/10 transition-colors disabled:opacity-50"
                                 >
                                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                                 </button>
                                 <button
                                    onClick={() => setRootToDelete(root)}
                                    title="Delete Complete Domain"
                                    className="p-1.5 rounded-lg text-secondary hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                 >
                                    <Trash2 className="w-4 h-4" />
                                 </button>
                                 <button onClick={() => toggleGroup(root)} className="ml-2 flex items-center gap-1 bg-brand/10 text-brand px-3 py-1 rounded-md text-[13px] font-medium hover:bg-brand/20 transition-colors">
                                    {totalDocs} {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                 </button>
                             </div>
                         </div>
                         {isExpanded && (
                            <div className="flex flex-col border-t border-border-dim bg-background">
                               <div className="px-4 py-3 flex items-center gap-2 border-b border-border-dim/50">
                                  <Search className="w-4 h-4 text-muted" />
                                  <input type="text" placeholder="Search" className="bg-transparent border-none outline-none text-[13px] w-full" />
                               </div>
                               <div className="p-2 text-[12px] font-medium text-secondary">List of trained pages</div>
                               {docs.map(doc => (
                                  <div key={doc._id} className="flex items-center justify-between py-2.5 px-4 hover:bg-foreground/[0.02] border-t border-border-dim/20 group">
                                      <a href={doc.sourceUrl} target="_blank" rel="noreferrer" className="text-[13px] text-brand hover:underline truncate mr-4">
                                         {doc.sourceUrl}
                                      </a>
                                      <div className="flex items-center gap-3">
                                         {doc.status === "pending" && <span className="text-[10px] uppercase font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-sm">Pending</span>}
                                         {doc.status === "processing" && <span className="text-[10px] uppercase font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-sm flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin"/> Processing</span>}
                                         {doc.status === "failed" && <span className="text-[10px] uppercase font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded-sm flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Failed</span>}
                                         <button 
                                            onClick={() => deleteDocument({ documentId: doc._id })}
                                            className="text-secondary hover:text-red-500 transition-colors opacity-50 group-hover:opacity-100"
                                         >
                                            <Trash2 className="w-4 h-4" />
                                         </button>
                                      </div>
                                  </div>
                               ))}
                            </div>
                         )}
                      </div>
                   )
               })}
            </div>
         </div>
      )}

      {/* FILE TAB */}
      {activeTab === "File" && (
          <div className="flex flex-col gap-4">
              <div className="flex justify-end">
                <button 
                   onClick={() => setIsModalOpen(true)}
                   className="h-9 px-4 rounded-[10px] bg-foreground text-background font-medium text-[13px] flex items-center gap-2 hover:opacity-90 transition-all"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload Document
                </button>
              </div>

              {documents === undefined ? (
                <div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>
              ) : documents.filter(d => d.format !== "url").length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 px-6 text-center border border-border-dim/50 border-dashed rounded-[16px] bg-foreground/[0.02]">
                  <FileText className="w-10 h-10 text-brand mb-4 opacity-80" />
                  <h3 className="text-sm font-medium text-foreground mb-1">No Documents Uploaded</h3>
                  <p className="text-[13px] text-secondary max-w-sm">
                    Upload PDF or DOCX files so the AI can securely learn about this company.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3 mt-2">
                  {documents.filter(d => d.format !== "url").map((doc) => (
                    <div key={doc._id} className="p-4 rounded-[12px] bg-sidebar/50 border border-border-dim flex items-center justify-between group">
                       <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-foreground/5 flex items-center justify-center text-secondary">
                             {doc.format === "text/plain" ? <AlignLeft className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
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
      )}
    </div>

    {/* File Upload Modal */}
    <SonaeModal
      isOpen={isModalOpen}
      onClose={() => setIsModalOpen(false)}
      title="Upload Knowledge Document"
      size="md"
    >
      <div className="flex flex-col gap-6 w-full pt-4">
        {fileError && (
           <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-[13px] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium">{fileError}</span>
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
               accept=".pdf,.docx,.txt,.csv"
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
                     Supports .PDF, .DOCX, .TXT, and .CSV format.
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

    {/* Bulk Delete Confirm Modal */}
    <SonaeModal
      isOpen={!!rootToDelete}
      onClose={() => !isDeletingBulk && setRootToDelete(null)}
      title="Delete Website Data"
      size="sm"
    >
        <div className="flex flex-col gap-6 w-full pt-4">
            <p className="text-[14px] text-secondary">
                Are you sure you want to completely remove <strong>{rootToDelete}</strong> and all of its trained sub-pages from Sonae&apos;s memory?
                This will delete the vectors instantly.
            </p>
            <div className="flex justify-end gap-3">
                <button
                   onClick={() => setRootToDelete(null)}
                   disabled={isDeletingBulk}
                   className="px-4 py-2 rounded-md hover:bg-white/5 transition-colors text-[13px] font-medium"
                >
                   Cancel
                </button>
                <button 
                   onClick={handleConfirmBulkDelete}
                   disabled={isDeletingBulk}
                   className="px-4 py-2 rounded-md bg-red-500 text-white transition-colors text-[13px] font-medium flex items-center gap-2 hover:bg-red-600"
                >
                   {isDeletingBulk && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                   Delete Everything
                </button>
            </div>
        </div>
    </SonaeModal>
    </>
  );
}
