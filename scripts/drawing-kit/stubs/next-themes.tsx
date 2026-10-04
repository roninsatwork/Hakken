import type { ReactNode } from "react";
export const useTheme = () => ({ theme: "dark", systemTheme: "dark", resolvedTheme: "dark", setTheme() {} });
export const ThemeProvider = ({ children }: { children: ReactNode }) => children;
