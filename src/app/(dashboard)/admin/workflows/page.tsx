"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { 
  Network,
  Plus, 
  Search, 
  Trash2,
  Settings
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useRouter } from "next/navigation";

export default function WorkflowsPage() {
  const router = useRouter();
  // Using the new workflows API
  const workflows = useQuery((api as any).workflows.list) || [];
  const createWorkflow = useMutation((api as any).workflows.createWorkflow);
  const deleteWorkflow = useMutation((api as any).workflows.deleteWorkflow);

  const [searchTerm, setSearchTerm] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deletingWorkflow, setDeletingWorkflow] = useState<any | null>(null);

  const [formData, setFormData] = useState({ name: "", description: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredWorkflows = workflows.filter((w: any) => 
    (w.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (w.description || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenAdd = () => {
    setFormData({ name: "", description: "" });
    setIsAddModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const newWorkflowId = await createWorkflow({ 
        name: formData.name, 
        description: formData.description 
      });
      setIsAddModalOpen(false);
      router.push(`/admin/workflows/${newWorkflowId}`);
    } catch (err: any) {
      alert(err.message || "Failed to create workflow");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (deletingWorkflow) {
      setIsSubmitting(true);
      try {
        await deleteWorkflow({ id: deletingWorkflow._id });
        setDeletingWorkflow(null);
      } catch (err: any) {
        alert(err.message || "Failed to delete workflow");
        setDeletingWorkflow(null);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="flex flex-col gap-5 h-full">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Network className="w-6 h-6 text-brand" />
            Agent Orchestration Workflows
          </h1>
          <p className="text-[13px] text-secondary mt-1">Visually build, chain, and coordinate multi-agent processes.</p>
        </div>
        
        <button 
          onClick={handleOpenAdd}
          className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-[13px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>New Workflow</span>
        </button>
      </div>

      <div className="flex items-center gap-4 bg-sidebar/40 border border-border-dim rounded-[16px] p-2 backdrop-blur-xl">
        <div className="flex-1 flex items-center gap-3 px-3 py-2 bg-background border border-border-dim rounded-[10px] text-secondary focus-within:text-foreground focus-within:border-brand/50 transition-all">
          <Search className="w-[18px] h-[18px]" />
          <input 
            type="text" 
            placeholder="Search workflows by name..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="bg-transparent border-none outline-none w-full text-[14px] placeholder:text-muted"
          />
        </div>
      </div>

      <div className="bg-sidebar/40 border border-border-dim rounded-[24px] backdrop-blur-xl overflow-hidden shadow-sm flex-1">
        <div className="overflow-x-auto h-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border-dim text-[11px] uppercase tracking-[0.1em] text-muted">
                <th className="px-4 py-3 font-medium">Workflow Name</th>
                <th className="px-4 py-3 font-medium">Trigger</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filteredWorkflows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-secondary">
                      No workflows found. Create your first autonomous pipeline to get started.
                    </td>
                  </tr>
                ) : (
                  <>
                    {filteredWorkflows.map((workflow: any) => (
                      <motion.tr 
                        key={workflow._id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        onClick={() => router.push(`/admin/workflows/${workflow._id}`)}
                        className="border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors group cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-[8px] bg-card border border-border-dim flex items-center justify-center text-foreground">
                              <Network className="w-4 h-4 text-brand" />
                            </div>
                            <div className="flex flex-col">
                              <span className="font-medium text-[13px] text-foreground leading-tight">
                                {workflow.name}
                              </span>
                              {workflow.description && (
                                <span className="text-[11px] text-secondary mt-0.5 line-clamp-1 max-w-[300px]">
                                  {workflow.description}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                           <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] bg-foreground/5 border border-border-dim w-fit">
                              <span className="text-[10px] font-mono tracking-widest text-foreground/80 uppercase">
                                {workflow.triggerType}
                              </span>
                            </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className={`flex items-center gap-2 text-[12px] font-medium ${workflow.isActive ? 'text-green-500' : 'text-neutral-500'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${workflow.isActive ? 'bg-green-500' : 'bg-neutral-500'}`} />
                            {workflow.isActive ? 'Active' : 'Draft'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={(e) => { e.stopPropagation(); router.push(`/admin/workflows/${workflow._id}`); }} className="p-2 rounded-full hover:bg-foreground/5 text-secondary hover:text-foreground transition-colors" title="Visual Builder">
                              <Settings className="w-4 h-4" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setDeletingWorkflow(workflow); }} className="p-2 rounded-full hover:bg-red-500/10 text-secondary hover:text-red-500 transition-colors" title="Delete Workflow">
                                <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </>
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

      <SonaeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Initialize New Workflow"
      >
        <p className="text-secondary mb-6 text-[15px]">Create a new agent orchestration pipeline.</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-medium text-secondary tracking-wide">Workflow Name</label>
            <input 
              type="text" 
              required
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              className="px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all text-sm"
              placeholder="e.g. Content Generation Pipeline"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-medium text-secondary tracking-wide">Short Description</label>
            <input 
              type="text" 
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
              className="px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all text-sm"
              placeholder="e.g. Multi-agent flow that researches and writes articles"
            />
          </div>

          <div className="flex justify-end gap-4 mt-6 pt-6 border-t border-border-dim">
            <button 
              type="button" 
              onClick={() => setIsAddModalOpen(false)}
              className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-sm font-medium"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-[10px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 text-sm disabled:opacity-50"
            >
              {isSubmitting ? "Creating..." : "Create Workflow"}
            </button>
          </div>
        </form>
      </SonaeModal>

      <SonaeModal
        isOpen={!!deletingWorkflow}
        onClose={() => setDeletingWorkflow(null)}
        title="Delete Workflow"
      >
        <div className="text-secondary mb-6 text-[15px] leading-relaxed flex flex-col gap-4">
          <p>
            Are you sure you want to permanently delete <strong className="text-foreground font-semibold">{deletingWorkflow?.name}</strong>?
          </p>
          <p className="text-[13px] text-muted">This action cannot be undone.</p>
        </div>
        <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-border-dim">
          <button 
            type="button" 
            onClick={() => setDeletingWorkflow(null)}
            className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-sm font-medium"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button 
            type="button"
            onClick={confirmDelete}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-[10px] bg-red-500/90 text-white hover:bg-red-500 transition-all text-sm font-medium shadow-lg shadow-red-500/20 disabled:opacity-50"
          >
            {isSubmitting ? "Deleting..." : "Delete Workflow"}
          </button>
        </div>
      </SonaeModal>
    </div>
  );
}
