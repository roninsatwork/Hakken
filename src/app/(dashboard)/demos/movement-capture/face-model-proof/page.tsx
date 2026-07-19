import { notFound } from "next/navigation";
import FaceModelProofClient from "./FaceModelProofClient";

export default function FaceModelProofPage() {
  if (process.env.E2E_AUTH_ENABLED !== "1" || !process.env.FACE_PROOF_FIXTURE_PATH) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[#07070b] px-5 py-10 text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-300">
            Actual browser-local MediaPipe fixture
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Pose-backed face scale-gap proof</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
            The supplied capture is embedded at 20% scale in a full frame. Acceptance requires the
            coarse Face Landmarker to miss, trustworthy Pose face evidence to create only a crop,
            and the real native-crop Face Landmarker to recover all 478 landmarks, ten iris points,
            gaze, expression and facial-transform evidence. Pose never supplies face landmarks.
          </p>
        </div>
        <FaceModelProofClient />
      </div>
    </main>
  );
}
