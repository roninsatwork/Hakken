# Getting Started

Follow these steps to set up the Sonae development environment on your local machine.

## 📋 Prerequisites

- **Node.js**: v20 or higher (required for Next.js 16/React 19 features).
- **Package Manager**: `npm` (standard for this project).
- **Convex Account**: Sign up at [convex.dev](https://www.convex.dev/).

## 🛠️ Local Setup

1.  **Clone the Repository**:
    ```bash
    git clone <repository-url>
    cd Sonae
    ```

2.  **Install Dependencies**:
    ```bash
    npm install
    ```

3.  **Environment Variables**:
    Create a `.env.local` file in the root directory. You can use `.env.example` as a template.
    ```bash
    cp .env.example .env.local
    ```
    > [!IMPORTANT]
    > Ensure `NEXT_PUBLIC_CONVEX_URL` and `CONVEX_DEPLOYMENT` are correctly set for your local development.

4.  **Run Development Servers**:
    You need to run both the Next.js dev server and the Convex backend.

    - **Terminal 1 (Frontend)**:
      ```bash
      npm run dev
      ```
    - **Terminal 2 (Backend)**:
      ```bash
      npx convex dev
      ```

## 🧪 Running Tests

Sonae uses a dual-environment testing strategy (Vitest).

- **UI Tests**:
  ```bash
  npm test
  ```
- **Backend Tests**:
  These are automatically run by the Convex engine or via the `npx convex test` command if configured.

## 💡 Quick Tips

- Use the `dev` branch for all active coding.
- Never use `window.alert` or `confirm`. Use the **Sonae Modal** component found in `src/ui/components/feedback`.
- Layouts are fluid by default; avoid fixed widths in your CSS/Tailwind classes.
