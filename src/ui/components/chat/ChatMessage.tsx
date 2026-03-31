"use client";

import { motion } from "framer-motion";
import { Sparkles, User } from "lucide-react";
import { Doc } from "@/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SonaeMarkdown } from "./SonaeMarkdown";

interface ChatMessageProps {
  message: Doc<"messages">;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isAssistant = message.role === "assistant";
  const user = useQuery(api.users.getMe);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} 
      className={`flex gap-4 w-full ${isAssistant ? "justify-start" : "justify-end"} mb-6 lg:mb-8`}
    >
      {/* Assistant Avatar Branding */}
      {isAssistant && (
        <div className="w-8 h-8 rounded-[10px] bg-brand flex-shrink-0 flex items-center justify-center shadow-lg shadow-brand/20 mt-1">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
      )}

      {/* Primary Message Bubble Container */}
      <div 
        className={`max-w-[95%] lg:max-w-[92%] px-5 py-4 rounded-[20px] relative ${
          isAssistant 
            ? "bg-sidebar/50 border border-border-dim backdrop-blur-3xl rounded-tl-[4px] shadow-md"
            : "bg-card dark:bg-[#252528] text-foreground/90 dark:text-white/90 border border-border-dim dark:border-white/5 rounded-tr-[4px] shadow-xl dark:shadow-black/20"
        }`}
      >
        <div className={`text-[14px] leading-[1.7] font-light tracking-wide ${isAssistant ? "" : "whitespace-pre-wrap"}`}>
          {isAssistant ? <SonaeMarkdown content={message.content} /> : message.content}
        </div>
        
        {/* Ambient Subtle Timestamp Data */}
        <div className={`text-[10px] font-mono mt-3 uppercase tracking-widest ${isAssistant ? "text-left opacity-40" : "text-right opacity-50 dark:opacity-40"}`}>
          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
      
      {/* User Avatar Badge */}
      {!isAssistant && (
        <div className="w-8 h-8 rounded-[10px] bg-foreground/10 border border-foreground/30 flex-shrink-0 flex items-center justify-center backdrop-blur-md mt-1 shadow-sm overflow-hidden">
          {user?.image ? (
            <img src={user.image} alt={user.name || "User"} className="w-full h-full object-cover" />
          ) : (
            <User className="w-4 h-4 text-foreground/80" />
          )}
        </div>
      )}
    </motion.div>
  );
}
