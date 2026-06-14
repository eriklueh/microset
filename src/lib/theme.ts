export type ThemeMode = "light" | "dark" | "system";
export type Accent = "neutral" | "lime" | "amber" | "sky" | "violet" | "rose";

export interface ThemeConfig {
  mode: ThemeMode;
  accent: Accent;
}

/** Accent options shown in the picker (swatch mirrors the CSS in index.css). */
export const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: "neutral", label: "Neutro", swatch: "oklch(0.72 0 0)" },
  { id: "lime", label: "Lima", swatch: "oklch(0.78 0.18 142)" },
  { id: "amber", label: "Ámbar", swatch: "oklch(0.80 0.15 75)" },
  { id: "sky", label: "Cielo", swatch: "oklch(0.70 0.14 235)" },
  { id: "violet", label: "Violeta", swatch: "oklch(0.66 0.18 295)" },
  { id: "rose", label: "Rosa", swatch: "oklch(0.68 0.19 12)" },
];

export const THEME_MODES: { id: ThemeMode; label: string }[] = [
  { id: "light", label: "Claro" },
  { id: "dark", label: "Oscuro" },
  { id: "system", label: "Sistema" },
];

function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveDark(mode: ThemeMode): boolean {
  return mode === "dark" || (mode === "system" && prefersDark());
}

/** Apply the theme to <html>: toggle `.dark` and set the accent data attribute. */
export function applyTheme(mode: ThemeMode, accent: Accent): void {
  const root = document.documentElement;
  root.classList.toggle("dark", resolveDark(mode));
  if (accent === "neutral") delete root.dataset.accent;
  else root.dataset.accent = accent;
}

/** Re-apply when the OS theme changes while in "system" mode. Returns a cleanup fn. */
export function watchSystemTheme(
  getMode: () => ThemeMode,
  getAccent: () => Accent,
): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => {
    if (getMode() === "system") applyTheme("system", getAccent());
  };
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}
