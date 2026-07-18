import { notFound } from "next/navigation";
import Link from "next/link";
import HandModelProofClient from "./HandModelProofClient";

export default function HandModelProofPage() {
  if (process.env.E2E_AUTH_ENABLED !== "1" || !process.env.HAND_PROOF_FIXTURE_PATH) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[#07070b] px-5 py-10 text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-300">
              Actual browser-local MediaPipe fixture
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Native-crop scale-gap model proof</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
              This lane embeds the supplied near-palm source at 20% scale in a full frame, where
              the real browser-local coarse Hand Landmarker misses it. Trustworthy captured Pose
              wrist/hand anchors recreate the native ROI from the same pixels; acceptance requires
              the crop refiner to recover complete 21-point image and world evidence. The separate
              synthetic matrix covers the near-camera, edge, orientation, crossing and occlusion cases.
            </p>
          </div>
          <Link
            className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5"
            href="/demos/movement-capture/hand-recovery-proof"
          >
            Synthetic fixture matrix
          </Link>
        </div>
        <HandModelProofClient />
      </div>
    </main>
  );
}
