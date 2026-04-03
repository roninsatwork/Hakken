"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { 
  ArrowLeft,
  Timer,
  Search,
  CheckCircle2,
  ToggleRight,
  ToggleLeft
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";

export default function EditSchedulePage() {
  const router = useRouter();
  const params = useParams();
  const scheduleId = params.id as string;
  
  const schedule = useQuery((api as any).scheduler.getSchedule, { scheduleId: scheduleId as any });
  const workflows = useQuery((api as any).workflows.list) || [];
  const updateSchedule = useMutation((api as any).scheduler.updateSchedule);

  const [formData, setFormData] = useState({
    name: "",
    workflowId: "",
  });

  // Scheduling State
  const [frequency, setFrequency] = useState("daily"); // daily, weekly, monthly
  const [timeOfDay, setTimeOfDay] = useState("09:00");
  const [dayOfWeek, setDayOfWeek] = useState("Monday");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  
  const [workflowSearch, setWorkflowSearch] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [errorModal, setErrorModal] = useState("");

  const filteredWorkflows = workflows.filter((w: any) => 
    w.name.toLowerCase().includes(workflowSearch.toLowerCase()) || 
    (w.description || "").toLowerCase().includes(workflowSearch.toLowerCase())
  );

  useEffect(() => {
     if (schedule) {
         setFormData({ name: schedule.name, workflowId: schedule.workflowId });
         setIsActive(schedule.isActive);
         
         const str = schedule.intervalStr.toLowerCase();
         if (str.startsWith("daily")) {
             setFrequency("daily");
             const timeParts = str.split(" at ");
             if (timeParts.length === 2) setTimeOfDay(timeParts[1]);
         } else if (str.startsWith("weekly")) {
             setFrequency("weekly");
             const dayMatch = str.match(/on ([a-z]+) at/i);
             if (dayMatch && dayMatch[1]) setDayOfWeek(dayMatch[1].charAt(0).toUpperCase() + dayMatch[1].slice(1));
             const timeParts = str.split(" at ");
             if (timeParts.length === 2) setTimeOfDay(timeParts[1]);
         } else if (str.startsWith("monthly")) {
             setFrequency("monthly");
             const dayMatch = str.match(/day (\d+) at/i);
             if (dayMatch && dayMatch[1]) setDayOfMonth(dayMatch[1]);
             const timeParts = str.split(" at ");
             if (timeParts.length === 2) setTimeOfDay(timeParts[1]);
         }
     }
  }, [schedule]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.workflowId) {
      setErrorModal("Please search and select a Target Workflow before saving the schedule.");
      return;
    }

    setIsSubmitting(true);
    
    // Construct human-readable interval string
    let constructedInterval = `Daily at ${timeOfDay}`;
    if (frequency === "weekly") constructedInterval = `Weekly on ${dayOfWeek} at ${timeOfDay}`;
    if (frequency === "monthly") constructedInterval = `Monthly on day ${dayOfMonth} at ${timeOfDay}`;

    try {
      await updateSchedule({
         scheduleId: scheduleId as any,
         name: formData.name,
         workflowId: formData.workflowId as any,
         intervalStr: constructedInterval,
         isActive
      });
      router.push("/admin/workflows/schedules");
    } catch (err: any) {
      setErrorModal(err.message || "Failed to edit schedule.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push("/admin/workflows/schedules")}
            className="w-10 h-10 rounded-full bg-sidebar/50 border border-border-dim flex items-center justify-center text-muted hover:text-foreground hover:bg-foreground/5 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Timer className="w-6 h-6 text-brand" />
              Edit Schedule
            </h1>
            <p className="text-[13px] text-secondary mt-1">Modify the autonomous trigger properties.</p>
          </div>
        </div>

        {/* State Toggle in Header */}
        <button 
          type="button"
          onClick={() => setIsActive(!isActive)}
          className={`flex items-center gap-3 group transition-colors ${isActive ? "text-[#10b981]" : "text-muted hover:text-foreground"}`}
        >
           <div className="flex flex-col items-end gap-0.5 text-right">
               <span className="text-[12px] font-bold tracking-widest uppercase">{isActive ? "Armed" : "Paused"}</span>
               <span className="text-[10px] text-muted/70 font-medium tracking-wide">{isActive ? "Will run immediately" : "Saved as a draft"}</span>
           </div>
           {isActive ? <ToggleRight className="w-9 h-9" /> : <ToggleLeft className="w-9 h-9" />}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6 flex-1 relative w-full pt-2">
        
        {/* Core Settings Block */}
        <section className="flex flex-col gap-4">
           
           <div className="flex flex-col gap-3 ml-1">
              <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase">Schedule Name</label>
              <input 
                type="text" 
                required
                autoFocus
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="e.g. Weekly Executive Summary"
                className="w-full bg-transparent border border-border-dim rounded-[10px] px-4 py-2.5 text-[13px] text-foreground outline-none focus:border-brand/40 transition-colors shadow-sm dark:bg-[#111111]/30 font-medium tracking-wide"
              />
           </div>
        </section>

        <div className="w-full h-[1px] bg-border-dim/50 my-1" />

        <section className="flex flex-col gap-4">
           <div className="flex flex-col gap-4 ml-1">
              <div className="flex items-center justify-between">
                  <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase flex items-center gap-2">Target Workflow</label>
              </div>

              {formData.workflowId ? (
                  // Selected State
                  <div className="flex items-center justify-between p-4 rounded-[12px] bg-brand/10 border border-brand/30 shadow-inner group transition-all">
                      <div className="flex flex-col gap-1">
                          <span className="text-[14px] font-bold text-brand flex items-center gap-2">
                             <CheckCircle2 className="w-4 h-4" />
                             {workflows.find((w: any) => w._id === formData.workflowId)?.name}
                          </span>
                          <span className="text-[12px] text-brand/70 font-medium tracking-wide">This workflow will be executed on the interval.</span>
                      </div>
                      <button 
                         type="button" 
                         onClick={() => setFormData({...formData, workflowId: ""})} 
                         className="px-4 py-2 rounded-[8px] bg-brand/20 text-brand text-[11px] font-bold tracking-widest uppercase hover:bg-brand hover:text-white transition-all"
                      >
                         Change
                      </button>
                  </div>
              ) : (
                  // Search & Select State
                  <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3 px-4 py-2.5 bg-transparent border border-border-dim rounded-[10px] focus-within:border-brand/40 transition-colors shadow-sm dark:bg-[#111111]/30">
                        <Search className="w-5 h-5 text-muted" />
                        <input 
                          type="text" 
                          placeholder="Search your workflows pool..." 
                          value={workflowSearch}
                          onChange={e => setWorkflowSearch(e.target.value)}
                          className="bg-transparent border-none outline-none w-full text-[14px] text-foreground placeholder:text-muted"
                        />
                      </div>

                      <div className="flex flex-col gap-1 max-h-[220px] overflow-y-auto custom-scrollbar p-1 border border-border-dim/30 rounded-[12px] bg-sidebar/10">
                          {filteredWorkflows.map((w: any) => (
                              <div 
                                key={w._id}
                                onClick={() => { setFormData({...formData, workflowId: w._id}); setWorkflowSearch(""); }}
                                className="px-4 py-2 bg-transparent hover:bg-foreground/5 cursor-pointer rounded-[8px] flex flex-col gap-0.5 transition-colors border border-transparent hover:border-border-dim/50"
                              >
                                 <span className="text-[14px] font-semibold text-foreground">{w.name}</span>
                                 <span className="text-[12px] text-muted line-clamp-1">{w.description || "No description provided."}</span>
                              </div>
                          ))}
                          {filteredWorkflows.length === 0 && (
                              <div className="py-6 text-center text-muted text-[13px]">
                                  No workflows found.
                              </div>
                          )}
                      </div>
                  </div>
              )}
           </div>
        </section>

        <div className="w-full h-[1px] bg-border-dim/50 my-1" />

        <section className="flex flex-col gap-6">
           <div className="flex flex-col gap-6 ml-1">

              {/* Dynamic Inputs Based on Frequency */}
              <div className="flex items-end gap-4 flex-wrap">
                 
                 {/* Frequency Selector */}
                 <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase">Execution Interval</label>
                    <div className="flex bg-transparent rounded-[12px] p-1 border border-border-dim w-fit">
                       {[
                         { id: "daily", label: "Daily" },
                         { id: "weekly", label: "Weekly" },
                         { id: "monthly", label: "Monthly" },
                       ].map(f => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setFrequency(f.id)}
                            className={`px-6 py-2 rounded-[8px] text-[12px] font-bold tracking-wide transition-all ${frequency === f.id ? 'bg-foreground/10 text-foreground' : 'text-muted hover:bg-foreground/5'}`}
                          >
                            {f.label}
                          </button>
                       ))}
                    </div>
                 </div>
                 
                 {frequency === "weekly" && (
                    <div className="flex flex-col gap-2 w-[200px]">
                       <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase">Day of the Week</label>
                       <select 
                          value={dayOfWeek} onChange={e => setDayOfWeek(e.target.value)}
                          className="w-full bg-transparent border border-border-dim rounded-[10px] px-4 py-2.5 text-[13px] text-foreground outline-none focus:border-brand/40 transition-colors shadow-sm dark:bg-[#111111]/30"
                       >
                          {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(d => (
                              <option key={d} value={d}>{d}</option>
                          ))}
                       </select>
                    </div>
                 )}

                 {frequency === "monthly" && (
                    <div className="flex flex-col gap-2 w-[200px]">
                       <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase">Day of the Month</label>
                       <select 
                          value={dayOfMonth} onChange={e => setDayOfMonth(e.target.value)}
                          className="w-full bg-transparent border border-border-dim rounded-[10px] px-4 py-2.5 text-[13px] text-foreground outline-none focus:border-brand/40 transition-colors shadow-sm dark:bg-[#111111]/30 flex-shrink-0"
                       >
                          {Array.from({length: 31}, (_, i) => i + 1).map(d => (
                              <option key={d} value={d}>{d}</option>
                          ))}
                       </select>
                    </div>
                 )}

                 <div className="flex flex-col gap-2 w-[200px]">
                    <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase">Time of Day (Local)</label>
                    <input 
                       type="time" 
                       value={timeOfDay} onChange={e => setTimeOfDay(e.target.value)}
                       className="w-full bg-transparent border border-border-dim rounded-[10px] px-4 py-2.5 text-[13px] text-foreground outline-none focus:border-brand/40 transition-colors shadow-sm dark:bg-[#111111]/30 font-mono"
                    />
                 </div>

              </div>
           </div>
        </section>

        {/* Action Belt */}
        <div className="flex items-center justify-end pt-4 border-t border-border-dim mt-2">
           <div className="flex items-center">
             <button 
               type="button" 
               onClick={() => router.push("/admin/workflows/schedules")}
               className="px-5 py-2.5 rounded-full text-secondary hover:text-foreground transition-all text-[13px] font-bold tracking-wide mr-3"
               disabled={isSubmitting}
             >
               Cancel
             </button>
             <button 
               type="submit"
               disabled={isSubmitting || !formData.workflowId || !formData.name}
               className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-foreground text-background font-bold tracking-wide text-[13px] hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(255,255,255,0.05)]"
             >
               {isSubmitting ? "Saving..." : "Save Changes"}
               {!isSubmitting && <CheckCircle2 className="w-4 h-4" />}
             </button>
           </div>
        </div>

      </form>

      {/* Error Modal */}
      <SonaeModal
        isOpen={!!errorModal}
        onClose={() => setErrorModal("")}
        title="Schedule Update Error"
      >
        <div className="text-secondary mb-6 text-[15px] leading-relaxed flex flex-col gap-4">
          <p>{errorModal}</p>
        </div>
        <div className="flex justify-end mt-8 pt-6 border-t border-border-dim">
          <button 
            type="button" 
            onClick={() => setErrorModal("")}
            className="px-8 py-3 rounded-[10px] bg-red-500/10 text-red-500 transition-all text-sm font-bold tracking-widest uppercase hover:bg-red-500 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      </SonaeModal>
    </div>
  );
}
