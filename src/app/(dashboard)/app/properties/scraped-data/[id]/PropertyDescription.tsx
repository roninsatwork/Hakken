import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";

interface PropertyDescriptionProps {
  rawText: string;
}

export default function PropertyDescription({ rawText }: PropertyDescriptionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!rawText) {
    return (
      <div className="text-[15px] leading-relaxed text-foreground/50 italic font-light">
        No description provided by the agent.
      </div>
    );
  }

  // 1. Pre-process the text: Add spaces after periods if followed by a capital letter without a space
  // E.g., "radiator.Reception Room" -> "radiator. Reception Room"
  let cleanText = rawText.replace(/([a-z])\.([A-Z])/g, '$1. $2');
  
  // Also fix colon spacing: "comprising :Entrance" -> "comprising: Entrance"
  cleanText = cleanText.replace(/\s?:([A-Z])/g, ': $1');

  // 2. Split into blocks based on obvious structure
  // Some agents use "Room Name - dimensions"
  // Let's split by periods, but we want to group things intelligently.
  // Actually, splitting by ". " gives us sentences.
  const sentences = cleanText.split(/\.\s+/).filter(Boolean);

  const formattedParagraphs: React.ReactNode[] = [];
  let currentList: string[] = [];

  const flushList = () => {
    if (currentList.length > 0) {
      formattedParagraphs.push(
        <ul key={`list-${formattedParagraphs.length}`} className="flex flex-col gap-3 my-4 pl-4 border-l-2 border-brand/30">
          {currentList.map((item, idx) => {
            // Bold the room name (everything before the first dash)
            const parts = item.split(' - ');
            if (parts.length > 1) {
              return (
                <li key={idx} className="text-[14px] leading-relaxed text-foreground/90">
                  <strong className="font-semibold text-foreground">{parts[0]}</strong> - {parts.slice(1).join(' - ')}.
                </li>
              );
            }
            return <li key={idx} className="text-[14px] leading-relaxed text-foreground/90">{item}.</li>;
          })}
        </ul>
      );
      currentList = [];
    }
  };

  sentences.forEach((sentence, index) => {
    // If the sentence looks like a room description (e.g. "Reception Room - 3.89m x 3.58m")
    if (sentence.match(/^[A-Z][a-zA-Z\s]+ - /) || sentence.match(/^[A-Z][a-zA-Z\s]+\s-\s/)) {
      currentList.push(sentence);
    } else {
      flushList();
      formattedParagraphs.push(
        <p key={`p-${index}`} className="text-[15px] leading-[1.8] text-foreground/80 font-light mb-4">
          {sentence}.
        </p>
      );
    }
  });
  flushList();

  return (
    <div className="relative w-full">
      <motion.div 
        animate={{ height: isExpanded ? "auto" : "280px" }}
        className="overflow-hidden relative"
      >
        <div className="pb-8">
          {formattedParagraphs}
        </div>

        {/* The Fade Overlay */}
        <AnimatePresence>
          {!isExpanded && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-sidebar via-sidebar/80 to-transparent pointer-events-none"
            />
          )}
        </AnimatePresence>
      </motion.div>

      {/* The Toggle Button */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-center translate-y-1/2 z-10">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-background border border-border-dim text-foreground text-[13px] font-medium shadow-lg hover:border-brand/50 hover:text-brand transition-all"
        >
          {isExpanded ? (
            <>Read Less <ChevronUp className="w-4 h-4" /></>
          ) : (
            <>Read Full Description <ChevronDown className="w-4 h-4" /></>
          )}
        </button>
      </div>
    </div>
  );
}
