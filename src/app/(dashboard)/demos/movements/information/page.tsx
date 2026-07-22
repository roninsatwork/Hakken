"use client";

import Header from "@/src/ui/components/layout/Header";
import Link from "next/link";
import {
  Info,
  Cpu,
  Gauge,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Laptop,
  Maximize2,
  PackageOpen,
  PauseCircle,
  Microscope,
  Target,
  Camera,
  Sun,
  UserRound,
  MoveDiagonal,
  ChevronDown,
} from "lucide-react";
import { CaptureExplorer, CaptureFlow } from "./_components/MovementInfoVisuals";

const ACCENT = "#f6ccbe";

const REQUIREMENTS = [
  {
    icon: Laptop,
    title: "A computer with a webcam",
    body: "Any modern laptop or desktop. The Studio runs in your web browser — nothing to install.",
  },
  {
    icon: Maximize2,
    title: "A little space",
    body: "Enough room to stand back so the camera can see you from head to feet.",
  },
  {
    icon: PackageOpen,
    title: "That's it — nothing else",
    body: "No sensors, no suits, no trackers, no phone apps. Just you and the camera.",
  },
];

const TRUST_POINTS = [
  {
    icon: Target,
    title: "Measured, not guessed",
    body: "Everything the avatar does comes from real measurements of your movement — hundreds of points, every scan.",
  },
  {
    icon: PauseCircle,
    title: "When unsure, it holds",
    body: "If the camera briefly loses a clear view — a fast turn, a hidden limb — the avatar calmly holds its pose rather than inventing movement. You'll never see it make something up.",
  },
  {
    icon: Microscope,
    title: "Checked, frame by frame",
    body: "Every improvement we make is verified against real recordings, frame by frame, by more than a thousand automated checks before it reaches you.",
  },
];

const CAPTURE_TIPS = [
  {
    icon: Camera,
    title: "Camera at chest height",
    body: "Roughly level with your chest gives the truest view of your posture.",
  },
  {
    icon: UserRound,
    title: "Face the camera between moves",
    body: "A moment facing forward between exercises helps the Studio keep a rich picture of you.",
  },
  {
    icon: MoveDiagonal,
    title: "Angle for forward moves",
    body: "For knee raises and anything moving towards the camera, stand at a slight angle — the movement captures at its full size.",
  },
  {
    icon: Sun,
    title: "Good, even light",
    body: "Daylight or a well-lit room helps the AI see every point clearly.",
  },
];

const FAQS = [
  {
    q: "Do I need any special equipment?",
    a: "No. Any modern computer with a webcam is enough. There's nothing to install and nothing to wear — no sensors, suits or trackers.",
  },
  {
    q: "Is video of me stored or shared?",
    a: "No. Your camera feed is processed on your own device and never uploaded. Only movement data — points and angles — is saved, so your session can be replayed without keeping any footage of you.",
  },
  {
    q: "Why an avatar instead of my own video?",
    a: "Two reasons: privacy — there's no footage of you to store — and clarity. The avatar shows the movement itself, cleanly, so you and your coach look at posture rather than a person.",
  },
  {
    q: "Why does it count down before starting?",
    a: "The Studio waits until it can see your whole body — head to feet — and gives you a 3-2-1 countdown to get into position. That way every session starts with a clean, complete picture of you.",
  },
  {
    q: "Why does the avatar sometimes hold still for a moment?",
    a: "That's honesty, not a glitch. When the camera can't see a movement clearly enough to trust — a very fast spin, a deep fold, a hidden arm — the avatar holds calmly instead of guessing. The moment tracking is confident again, it continues.",
  },
  {
    q: "How closely does the avatar follow me?",
    a: "Each limb is held to a strict follow tolerance against your real movement, and we verify it frame by frame against recordings. Fast, complex movement is genuinely hard to track from one camera, and where confidence drops the avatar holds rather than guesses.",
  },
  {
    q: "What happens to my recordings?",
    a: "They're saved as movement data in your library, ready to replay on the avatar whenever you like — and you can delete them at any time.",
  },
  {
    q: "Does my movement data train AI models?",
    a: "No. The AI models are pre-trained and run locally on your device. Your movement data is used only to show and replay your sessions.",
  },
];

const STATS = [
  { value: "553", label: "points tracked on you, live" },
  { value: "4", label: "AI vision systems working together" },
  { value: "~14", label: "full-body scans every second" },
  { value: "0", label: "video ever stored of you" },
];

const AI_SYSTEMS = [
  {
    name: "Body & pose",
    engine: "Google MediaPipe",
    body: "Finds your skeleton — shoulders, elbows, hips, knees and more — and how it sits in 3D space.",
  },
  {
    name: "Face & expression",
    engine: "Google MediaPipe",
    body: "Reads 478 points across your face, including where your eyes are looking, so the avatar feels alive.",
  },
  {
    name: "Hands",
    engine: "Google MediaPipe",
    body: "Tracks all 21 points on each hand, so gestures and finger positions come through.",
  },
  {
    name: "Body outline",
    engine: "TensorFlow (BodyPix)",
    body: "Separates you from the background and maps your body's shape for a truer, fuller capture.",
  },
];

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-[11px] font-bold uppercase tracking-[0.14em]"
      style={{ color: ACCENT }}
    >
      {children}
    </span>
  );
}

export default function MovementInformationPage() {
  return (
    <>
      <Header />
      <div className="flex flex-col gap-8 pb-10">
        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Info className="w-6 h-6 text-brand" />
            How the Posture Studio Works
          </h1>
          <p className="text-[13px] text-secondary mt-1 max-w-2xl">
            A plain-English look at what happens when you step in front of the
            camera — how we see your movement, understand it, and bring it to
            life on your avatar.
          </p>
        </div>

        {/* Stat band */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {STATS.map((stat) => (
            <div
              key={stat.label}
              className="rounded-[16px] border border-border-dim bg-card/60 p-5 backdrop-blur-xl"
            >
              <div className="text-3xl font-bold tracking-tight text-foreground tabular-nums">
                {stat.value}
              </div>
              <div className="text-[12px] text-secondary mt-1 leading-snug">
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* What we capture — interactive visual */}
        <section className="rounded-[20px] border border-border-dim bg-sidebar/40 backdrop-blur-xl overflow-hidden">
          <CaptureExplorer />
        </section>

        {/* How it works */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <SectionEyebrow>How it works</SectionEyebrow>
            <h2 className="text-xl font-semibold text-foreground">
              From your camera to your avatar, in four steps
            </h2>
          </div>
          <CaptureFlow />
        </section>

        {/* The AI behind it */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <SectionEyebrow>The intelligence behind it</SectionEyebrow>
            <h2 className="text-xl font-semibold text-foreground flex items-center gap-2.5">
              <Sparkles className="w-5 h-5" style={{ color: ACCENT }} />
              Four AI systems, working together
            </h2>
            <p className="text-[14px] text-secondary leading-relaxed max-w-2xl">
              The Posture Studio is powered by industry-leading vision AI from
              Google and TensorFlow — the same families of technology behind
              modern on-device tracking. It all runs right here in your browser,
              on your own device.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {AI_SYSTEMS.map((system) => (
              <div
                key={system.name}
                className="flex flex-col gap-2 rounded-[16px] border border-border-dim bg-card/60 p-5 backdrop-blur-xl"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[15px] font-semibold text-foreground">
                    {system.name}
                  </h3>
                  <span
                    className="flex items-center gap-1.5 rounded-full border border-border-dim px-2.5 py-1 text-[11px] font-medium text-secondary"
                  >
                    <Cpu className="w-3 h-3" />
                    {system.engine}
                  </span>
                </div>
                <p className="text-[13px] text-secondary leading-relaxed">
                  {system.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Speed + Privacy pair */}
        <section className="grid gap-3 lg:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-[16px] border border-border-dim bg-card/60 p-6 backdrop-blur-xl">
            <div className="flex items-center gap-2.5">
              <Gauge className="w-5 h-5" style={{ color: ACCENT }} />
              <h3 className="text-[16px] font-semibold text-foreground">
                Rich detail, smooth playback
              </h3>
            </div>
            <p className="text-[13px] text-secondary leading-relaxed">
              Around 14 times a second, we take a complete scan of your whole
              body — each one far richer than an ordinary video frame, with 553
              points captured in 3D. Your recording then plays back smoothly, at
              the exact speed you moved.
            </p>
          </div>
          <div className="flex flex-col gap-3 rounded-[16px] border border-border-dim bg-card/60 p-6 backdrop-blur-xl">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5" style={{ color: "#10b981" }} />
              <h3 className="text-[16px] font-semibold text-foreground">
                Private by design
              </h3>
            </div>
            <p className="text-[13px] text-secondary leading-relaxed">
              Your camera feed never leaves your device, and we never store
              video of you. Only the movement data — the points and angles — is
              kept, so your session can be replayed without keeping any footage.
            </p>
          </div>
        </section>

        {/* Built to be trusted */}
        <section className="rounded-[20px] border border-border-dim bg-sidebar/40 backdrop-blur-xl p-7 flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <SectionEyebrow>Built to be trusted</SectionEyebrow>
            <h2 className="text-xl font-semibold text-foreground">
              The avatar never makes things up
            </h2>
            <p className="text-[14px] text-secondary leading-relaxed max-w-2xl">
              A coaching tool is only useful if you can believe what it shows
              you. The Studio is built around one rule: show what was measured,
              and nothing else.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {TRUST_POINTS.map((point) => (
              <div key={point.title} className="flex flex-col gap-2.5">
                <point.icon className="w-5 h-5" style={{ color: ACCENT }} />
                <h3 className="text-[15px] font-semibold text-foreground">
                  {point.title}
                </h3>
                <p className="text-[13px] text-secondary leading-relaxed">
                  {point.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* What you need */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <SectionEyebrow>What you need</SectionEyebrow>
            <h2 className="text-xl font-semibold text-foreground">
              Just a webcam. Really.
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {REQUIREMENTS.map((item) => (
              <div
                key={item.title}
                className="flex flex-col gap-2.5 rounded-[16px] border border-border-dim bg-card/60 p-5 backdrop-blur-xl"
              >
                <item.icon className="w-5 h-5" style={{ color: ACCENT }} />
                <h3 className="text-[15px] font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="text-[13px] text-secondary leading-relaxed">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Capture tips */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <SectionEyebrow>Getting the best capture</SectionEyebrow>
            <h2 className="text-xl font-semibold text-foreground">
              Four small things that make a big difference
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CAPTURE_TIPS.map((tip) => (
              <div
                key={tip.title}
                className="flex flex-col gap-2.5 rounded-[16px] border border-border-dim bg-card/60 p-5 backdrop-blur-xl"
              >
                <tip.icon className="w-5 h-5" style={{ color: ACCENT }} />
                <h3 className="text-[14px] font-semibold text-foreground">
                  {tip.title}
                </h3>
                <p className="text-[13px] text-secondary leading-relaxed">
                  {tip.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Two studios */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <SectionEyebrow>Two ways to use it</SectionEyebrow>
            <h2 className="text-xl font-semibold text-foreground">
              Practise live, or review a recording
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2 rounded-[16px] border border-border-dim bg-card/60 p-5 backdrop-blur-xl">
              <h3 className="text-[15px] font-semibold text-foreground">
                Guided practice
              </h3>
              <p className="text-[13px] text-secondary leading-relaxed">
                Follow a coach avatar side by side with your own, and get live
                feedback on how closely you match the movement.
              </p>
            </div>
            <div className="flex flex-col gap-2 rounded-[16px] border border-border-dim bg-card/60 p-5 backdrop-blur-xl">
              <h3 className="text-[15px] font-semibold text-foreground">
                Replay &amp; review
              </h3>
              <p className="text-[13px] text-secondary leading-relaxed">
                Play back a saved recording on the avatar to see exactly how the
                movement was performed, frame by frame.
              </p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <SectionEyebrow>Common questions</SectionEyebrow>
            <h2 className="text-xl font-semibold text-foreground">
              Everything else you might be wondering
            </h2>
          </div>
          <div className="flex flex-col gap-2">
            {FAQS.map((faq) => (
              <details
                key={faq.q}
                className="group rounded-[14px] border border-border-dim bg-card/60 backdrop-blur-xl open:bg-card/80 transition-colors"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
                  <span className="text-[14px] font-medium text-foreground">
                    {faq.q}
                  </span>
                  <ChevronDown className="w-4 h-4 shrink-0 text-secondary transition-transform group-open:rotate-180" />
                </summary>
                <p className="px-5 pb-4 text-[13px] text-secondary leading-relaxed max-w-3xl">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* Footer CTA */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[16px] border border-border-dim bg-sidebar/40 px-6 py-5 backdrop-blur-xl">
          <div>
            <div className="text-[15px] font-semibold text-foreground">
              Ready to see it in action?
            </div>
            <div className="text-[13px] text-secondary mt-0.5">
              Open the Studio Library to play a recorded routine.
            </div>
          </div>
          <Link
            href="/demos/movements"
            className="flex items-center gap-2 px-4 py-2 rounded-[10px] text-[13px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10"
          >
            <span>Go to Studio Library</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </>
  );
}
