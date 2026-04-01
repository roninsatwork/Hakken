"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { 
  Bot, 
  Workflow,
  Plus, 
  Search, 
  Trash2,
  Settings
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useRouter } from "next/navigation";

export default function AgentsPage() {
  const router = useRouter();
  const agents = useQuery(api.agents.list) || [];
  const createAgent = useMutation(api.agents.createAgent);
  const deleteAgent = useMutation(api.agents.deleteAgent);

  const [searchTerm, setSearchTerm] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deletingAgent, setDeletingAgent] = useState<any | null>(null);

  const [formData, setFormData] = useState({ name: "", description: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredAgents = agents.filter((a: any) => 
    (a.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (a.description || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenAdd = () => {
    setFormData({ name: "", description: "" });
    setIsAddModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const newAgentId = await createAgent({ 
        name: formData.name, 
        description: formData.description 
      });
      setIsAddModalOpen(false);
      // Navigate straight to the new agent's config page
      router.push(`/admin/agents/${newAgentId}`);
    } catch (err: any) {
      alert(err.message || "Failed to create agent");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (deletingAgent) {
      setIsSubmitting(true);
      try {
        await deleteAgent({ id: deletingAgent._id });
        setDeletingAgent(null);
      } catch (err: any) {
        alert(err.message || "Failed to delete agent");
        setDeletingAgent(null);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="flex flex-col gap-5 h-full">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Workflow className="w-6 h-6 text-brand" />
            Agent Orchestration
          </h1>
          <p className="text-[13px] text-secondary mt-1">Create and configure autonomous AI agents for workflows.</p>
        </div>
        
        <button 
          onClick={handleOpenAdd}
          className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-[13px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>New Agent</span>
        </button>
      </div>

      {/* Control Bar */}
      <div className="flex items-center gap-4 bg-sidebar/40 border border-border-dim rounded-[16px] p-2 backdrop-blur-xl">
        <div className="flex-1 flex items-center gap-3 px-3 py-2 bg-background border border-border-dim rounded-[10px] text-secondary focus-within:text-foreground focus-within:border-brand/50 transition-all">
          <Search className="w-[18px] h-[18px]" />
          <input 
            type="text" 
            placeholder="Search agents by name or description..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="bg-transparent border-none outline-none w-full text-[14px] placeholder:text-muted"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-sidebar/40 border border-border-dim rounded-[24px] backdrop-blur-xl overflow-hidden shadow-sm flex-1">
        <div className="overflow-x-auto h-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border-dim text-[11px] uppercase tracking-[0.1em] text-muted">
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 font-medium">Model</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filteredAgents.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-secondary">
                      No agents found. Create your first autonomous agent to get started.
                    </td>
                  </tr>
                ) : (
                  <>
                    {filteredAgents.map((agent: any) => (
                      <motion.tr 
                        key={agent._id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        onClick={() => router.push(`/admin/agents/${agent._id}`)}
                        className="border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors group cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {agent.avatar ? (
                              <img src={agent.avatar} alt={agent.name} className="w-8 h-8 rounded-full border border-border-dim object-cover" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-card border border-border-dim flex items-center justify-center text-foreground">
                                <Bot className="w-4 h-4 text-brand" />
                              </div>
                            )}
                            <div className="flex flex-col">
                              <span className="font-medium text-[13px] text-foreground leading-tight">
                                {agent.name}
                              </span>
                              {agent.description && (
                                <span className="text-[11px] text-secondary mt-0.5 line-clamp-1 max-w-[300px]">
                                  {agent.description}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                           <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-foreground/5 border border-border-dim w-fit">
                              <span className="text-[10px] font-mono tracking-widest text-foreground/80 lowercase">
                                {agent.modelId}
                              </span>
                            </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className={`flex items-center gap-2 text-[12px] font-medium ${agent.isActive ? 'text-green-500' : 'text-neutral-500'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${agent.isActive ? 'bg-green-500' : 'bg-neutral-500'}`} />
                            {agent.isActive ? 'Active' : 'Draft'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={(e) => { e.stopPropagation(); router.push(`/admin/agents/${agent._id}`); }} className="p-2 rounded-full hover:bg-foreground/5 text-secondary hover:text-foreground transition-colors" title="Configure Agent">
                              <Settings className="w-4 h-4" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setDeletingAgent(agent); }} className="p-2 rounded-full hover:bg-red-500/10 text-secondary hover:text-red-500 transition-colors" title="Delete Agent">
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

      {/* Add Modal */}
      <SonaeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Initialize New Agent"
      >
        <p className="text-secondary mb-6 text-[15px]">Create a new autonomous agent wrapper.</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-medium text-secondary tracking-wide">Agent Name</label>
            <input 
              type="text" 
              required
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              className="px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all text-sm"
              placeholder="e.g. Lead SEO Analyst"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-medium text-secondary tracking-wide">Short Description</label>
            <input 
              type="text" 
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
              className="px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all text-sm"
              placeholder="e.g. Audits web pages for technical SEO"
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
              {isSubmitting ? "Creating..." : "Create Agent"}
            </button>
          </div>
        </form>
      </SonaeModal>

      {/* Delete Confirmation Modal */}
      <SonaeModal
        isOpen={!!deletingAgent}
        onClose={() => setDeletingAgent(null)}
        title="Delete Agent"
      >
        <div className="text-secondary mb-6 text-[15px] leading-relaxed flex flex-col gap-4">
          <p>
            Are you sure you want to permanently delete <strong className="text-foreground font-semibold">{deletingAgent?.name}</strong>?
          </p>
          <p className="text-[13px] text-muted">This will remove it from any associated workflows. This action cannot be undone.</p>
        </div>
        <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-border-dim">
          <button 
            type="button" 
            onClick={() => setDeletingAgent(null)}
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
            {isSubmitting ? "Deleting..." : "Delete Agent"}
          </button>
        </div>
      </SonaeModal>
    </div>
  );
}
