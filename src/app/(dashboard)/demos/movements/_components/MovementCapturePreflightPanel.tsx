import Typography from "@/src/ui/atoms/typography";
import type { MovementCapturePreflight } from "../_lib/movementCapturePreflight";

export default function MovementCapturePreflightPanel({
  capturePreflight,
}: {
  capturePreflight: MovementCapturePreflight;
}) {
  return (
    <section
      aria-label="Capture channel preflight"
      className="rounded-2xl border border-white/10 bg-[#0d0b12] px-4 py-4"
      data-testid="capture-channel-preflight"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Typography className="text-sm font-semibold text-white">Capture channel preflight</Typography>
          <Typography className="mt-1 text-xs text-white/60">
            Current recording gate and Deep Capture build status are reported separately.
          </Typography>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className={`rounded-full border px-3 py-1 ${
            capturePreflight.currentRecordingReady
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
              : "border-amber-300/30 bg-amber-300/10 text-amber-100"
          }`}>
            Current gate {capturePreflight.currentRecordingReady ? "ready" : "blocked"}
          </span>
          <span className={`rounded-full border px-3 py-1 ${
            capturePreflight.deepCaptureReady
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
              : "border-[#f6ccbe]/30 bg-[#f6ccbe]/10 text-[#f6ccbe]"
          }`}>
            Deep Capture {capturePreflight.readyChannelCount}/{capturePreflight.totalChannelCount}
          </span>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {capturePreflight.channels.map((channel) => (
          <div
            className="rounded-xl border border-white/8 bg-black/20 px-3 py-2"
            data-channel-id={channel.id}
            data-channel-status={channel.status}
            key={channel.id}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-white/90">{channel.label}</span>
              <span className={`text-[10px] font-black uppercase tracking-wide ${
                channel.status === "ready"
                  ? "text-emerald-300"
                  : channel.status === "planned"
                    ? "text-[#f6ccbe]"
                    : channel.status === "partial"
                      ? "text-amber-200"
                      : "text-red-300"
              }`}>
                {channel.status}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-4 text-white/55">{channel.message}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
