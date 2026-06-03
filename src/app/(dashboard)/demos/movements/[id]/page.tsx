"use client";

import React, { useState, use } from "react";
import Header from "@/src/ui/components/layout/Header";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trash2, Activity, Database, Clock } from "lucide-react";
import Typography from "@/src/ui/atoms/typography";
import { useMovementFrames } from "../_hooks/useMovementFrames";
import MovementDeleteDialog from "../_components/MovementDeleteDialog";
import MovementFrameViewer from "../_components/MovementFrameViewer";

export default function MovementDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const router = useRouter();
  const movementId = unwrappedParams.id as Id<"movements">;

  const movement = useQuery(api.movements.get, { id: movementId });
  const removeMovement = useMutation(api.movements.remove);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const { frames, fps, format, isLoading, error, reload } = useMovementFrames(movement);

  const confirmDelete = () => {
    setDeleteModalOpen(true);
  };

  const executeDelete = async () => {
    await removeMovement({ id: movementId });
    setDeleteModalOpen(false);
    router.push("/demos/movements");
  };

  if (movement === undefined) {
    return (
      <>
        <Header />
        <div className="flex items-center justify-center py-24 text-cyan-500 animate-pulse font-medium">
          Loading movement data...
        </div>
      </>
    );
  }

  if (movement === null) {
    return (
      <>
        <Header />
        <div className="flex items-center justify-center py-24 text-red-500 font-medium">
          Movement not found.
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6">
        <div className="w-full flex justify-start">
          <Link href="/demos/movements" className="flex items-center gap-2 text-[13px] font-medium text-secondary hover:text-foreground transition-colors px-4 py-2 bg-sidebar/50 rounded-[10px] border border-border-dim w-fit shadow-sm">
            <ArrowLeft className="w-4 h-4" />
            Back to Library
          </Link>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <Activity className="w-7 h-7 text-brand" />
              {movement.title}
            </h1>
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
              movement.difficulty === 'Beginner' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
              movement.difficulty === 'Intermediate' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
              'bg-red-500/10 text-red-400 border-red-500/20'
            }`}>
              {movement.difficulty}
            </span>
          </div>
          <Typography className="text-muted-foreground text-sm mt-1">
            Recorded on {new Date(movement.createdAt).toLocaleDateString()} at {new Date(movement.createdAt).toLocaleTimeString()}
          </Typography>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 w-full mt-4">
          {/* Left Column: Visualizer */}
          <div className="flex-1">
            <MovementFrameViewer
              frames={frames}
              fps={fps}
              isLoading={isLoading}
              error={error}
              onRetry={reload}
              controls="scrubber"
            />
          </div>

          {/* Right Column: Telemetry */}
          <div className="w-full lg:w-80 flex flex-col gap-4">
            <div className="bg-sidebar/40 border border-border-dim rounded-3xl p-6 flex flex-col gap-6 shadow-sm backdrop-blur-xl">
              <div>
                <Typography className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Telemetry Data</Typography>
                <div className="flex flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <Database className="w-5 h-5 text-cyan-500 mt-0.5" />
                    <div className="flex flex-col">
                      <Typography className="text-sm font-medium text-foreground block">Blob Storage</Typography>
                      <Typography className="text-xs text-muted-foreground mt-0.5 block">
                        {format === "legacy-inline-json" ? "Legacy DB String" : "Connected & Verified"}
                      </Typography>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-cyan-500 mt-0.5" />
                    <div className="flex flex-col">
                      <Typography className="text-sm font-medium text-foreground block">Duration</Typography>
                      <Typography className="text-xs text-muted-foreground mt-0.5 block">
                        {frames && frames.length > 0 ? `${(frames.length / fps).toFixed(1)} Seconds` : "Calculating..."}
                      </Typography>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Activity className="w-5 h-5 text-cyan-500 mt-0.5" />
                    <div className="flex flex-col">
                      <Typography className="text-sm font-medium text-foreground block">Frame Count</Typography>
                      <Typography className="text-xs text-muted-foreground mt-0.5 block">
                        {frames && frames.length > 0 ? `${frames.length} Captures` : "Loading..."}
                      </Typography>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-border-dim pt-6">
                <Typography className="text-xs font-bold text-red-500/80 uppercase tracking-widest mb-4">Danger Zone</Typography>
                <button 
                  onClick={confirmDelete}
                  className="w-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 font-medium py-2.5 rounded-xl transition-all text-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Routine
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <MovementDeleteDialog
        isOpen={deleteModalOpen}
        movement={movement}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={executeDelete}
      />
    </>
  );
}
