import type { ChangeEvent } from "react";

export type WidgetConfigTab =
  | "Appearance"
  | "Welcome Screen"
  | "Conversation Starters"
  | "Greeting"
  | "Integration";

export type LogoUploadHandler = (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
