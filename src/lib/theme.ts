export type ThemeMode = "light" | "dark" | "system";
export type Accent = "lime" | "sky" | "violet" | "amber" | "rose" | "teal";

export interface ThemeConfig {
  mode: ThemeMode;
  accent: Accent;
}

/** Accent options (swatch = the dark-mode value, mirrors index.css). */
export const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: "lime", label: "Lima", swatch: "#c4f82a" },
  { id: "sky", label: "Cielo", swatch: "#6cb6ff" },
  { id: "violet", label: "Violeta", swatch: "#c79bff" },
  { id: "amber", label: "Ámbar", swatch: "#ffb27a" },
  { id: "rose", label: "Rosa", swatch: "#ff6b8a" },
  { id: "teal", label: "Aqua", swatch: "#5fe3d0" },
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
  if (accent === "lime") delete root.dataset.accent;
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
