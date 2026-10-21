export type Theme = "system" | "light" | "dark";
export type Accent = "lavender" | "rose" | "peach" | "lemon" | "mint" | "sky";

const THEMES: readonly Theme[] = ["system", "light", "dark"];
const ACCENTS: readonly Accent[] = ["lavender", "rose", "peach", "lemon", "mint", "sky"];

export const THEME_KEY = "ui.theme";
export const ACCENT_KEY = "ui.accent";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function readTheme(): Theme {
  const value = read(THEME_KEY);
  return THEMES.find((t) => t === value) ?? "system";
}

export function readAccent(): Accent {
  const value = read(ACCENT_KEY);
  return ACCENTS.find((a) => a === value) ?? "lavender";
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export function applyAccent(accent: Accent): void {
  document.documentElement.setAttribute("data-accent", accent);
}
