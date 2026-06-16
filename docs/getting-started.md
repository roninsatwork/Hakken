# Getting Started

Follow these steps to set up the Sonae development environment on your local machine.

## Prerequisites

- **Node.js**: `22.13.0` (`.nvmrc` / `.node-version`).
- **Package Manager**: `npm` (standard for this project).
- **Convex Account**: Sign up at [convex.dev](https://www.convex.dev/).

## Local Setup

1.  **Clone the Repository**:
    ```bash
    git clone <repository-url>
    cd Sonae
    ```

2.  **Install Dependencies**:
    ```bash
    npm ci
    ```

3.  **Environment Variables**:
    Create a `.env.local` file in the root directory. You can use `.env.example` as a template.
    ```bash
    cp .env.example .env.local
    ```
    > [!IMPORTANT]
    > Ensure `NEXT_PUBLIC_CONVEX_URL` and `CONVEX_DEPLOYMENT` are correctly set for your local development.

4.  **Validate Setup**:
    ```bash
    npm run verify:env
    npm run setup:validate
    ```
    The first command checks Node and installed dependency versions against `package-lock.json`. The setup validator checks local Convex configuration, auth/provider readiness, and optional ingestion credentials without printing secret values.

5.  **Run Development Servers**:
    You need to run both the Next.js dev server and the Convex backend.

    - **Terminal 1 (Frontend)**:
      ```bash
      npm run dev
      ```
    - **Terminal 2 (Backend)**:
      ```bash
      npm run convex:dev
      ```

## Running Tests

Sonae uses a dual-environment testing strategy (Vitest).

- **UI Tests**:
  ```bash
  npm run test:run
  ```
- **Full Local Check**:
  ```bash
  npm run check
  ```
- **Build Check**:
  ```bash
  npm run build
  ```

## 💡 Quick Tips

- Use the `dev` branch for all active coding.
- Push to `main` only when you intend to trigger the production deploy workflow.
- Run `npm run setup:validate -- --profile=production` before handing a new product or deployment environment to operators.
- Never use `window.alert` or `confirm`. Use the **Sonae Modal** component found in `src/ui/components/feedback`.
- Layouts are fluid by default; avoid fixed widths in your CSS/Tailwind classes.
