import { FileText, X } from "lucide-react";

type PendingFileTrayProps = {
  files: File[];
  onRemoveFile: (index: number) => void;
};

export function PendingFileTray({ files, onRemoveFile }: PendingFileTrayProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-3 px-1">
      {files.map((file, index) => (
        <div
          key={`${file.name}-${index}`}
          className="flex items-center gap-2 bg-foreground/5 dark:bg-white/10 px-3 py-1.5 rounded-full relative group"
        >
          <FileText className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[13px] font-medium text-foreground max-w-[120px] truncate">{file.name}</span>
          <button
            type="button"
            onClick={() => onRemoveFile(index)}
            className="w-4 h-4 rounded-full bg-foreground/10 hover:bg-foreground/20 flex items-center justify-center transition-colors -mr-1"
          >
            <X className="w-3 h-3 text-foreground" />
          </button>
        </div>
      ))}
    </div>
  );
}
