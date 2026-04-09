# Frontend Development & Design System

Sonae's frontend is designed to feel premium, cinematic, and highly responsive. This document details the aesthetic constraints and layout rules.

## 🌊 Fluid Workspace & Spacing

Sonae explicitly bans maximum width containers. The platform must scale smoothly across all screen sizes.

- **Strict Rule**: Never use `max-w-7xl` or similar "centering" constraints on main content wrappers.
- **Layout Wrapper**: Use the `<FluidWorkspace />` component to wrap all application content.
- **Page Spacing**: Every new admin page should wrap its inner content in a `<div className="flex flex-col gap-6">` immediately following the `<Header />`.
    - Do not use arbitrary top margins (`mt-*`) or height constraints (`h-screen`) on inner wrappers.
    - The `Header` handles organic top spacing via its negative margin (`-mb-8`) against the `FluidWorkspace` parent padding.

## 💎 Glassmorphism & High-Density UI

Layering and translucent textures are foundational to our visual identity.

- **Backgrounds**: Use `bg-sidebar/40`, `bg-foreground/5`, and `backdrop-blur-3xl`. Avoid solid, opaque fills for layered elements.
- **Lighting**: Apply subtle inner glows using radial gradients (`bg-radial-at-tl`) and deep shadows (`shadow-2xl`) to create tactical depth.
- **Typography**: Headers should use `font-light` with wider tracking (`tracking-[0.12em]`) for an editorial, premium feel.

## 🛡️ The Sonae Modal Protocol

Native browser dialogs (`window.alert`, `window.confirm`) are strictly prohibited.

- **Component**: `<SonaeModal />` (located in `src/ui/components/feedback`).
- **Implementation**:
    - Powered by **Framer Motion** for spring-based entrance/exit animations.
    - Appearance: The entire modal must be a unified "glass object" without internal divider lines.
    - Corner Radius: Standard `rounded-[32px]`.
    - Blur: High-fidelity `backdrop-blur-3xl`.

## 🎨 Tailwind CSS v4

Sonae utilizes the state-of-the-art Tailwind CSS v4 engine.
- Configuration is handled natively via CSS imports.
- Utilize CSS variables for theme-aware tokens (e.g., `--color-brand-primary`).

---

> [!TIP]
> Always check `src/ui/components/layout/FluidWorkspace.tsx` to understand the root layout architecture before creating new routes.
