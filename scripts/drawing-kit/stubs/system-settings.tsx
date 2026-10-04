// The drawing kit's settings: the one record of the look (hakken.theme.json).
import type { ReactNode } from "react";
import theme from "../../../hakken.theme.json";
const settings = { platformName: "Hakken", ...theme, logoUrlLight: undefined, logoUrlDark: undefined };
export const useSystemSettings = () => settings;
export const SystemSettingsProvider = ({ children }: { children: ReactNode }) => children;
export const onBrandFor = () => undefined;
export const hexToRgbTriplet = () => undefined;
