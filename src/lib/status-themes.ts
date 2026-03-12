export type StatusTheme = "midnight" | "aurora" | "clean" | "ember" | "terminal";

export const STATUS_THEMES: StatusTheme[] = ["midnight", "aurora", "clean", "ember", "terminal"];

interface ThemeMeta {
  name: string;
  description: string;
  preview: { bg: string; accent: string; text: string };
}

export const themeMeta: Record<StatusTheme, ThemeMeta> = {
  midnight: {
    name: "Midnight",
    description: "Dark blue with cyan glow",
    preview: { bg: "#1a1a2e", accent: "#2dd4bf", text: "#e2e8f0" },
  },
  aurora: {
    name: "Aurora",
    description: "Deep violet with chromatic shifts",
    preview: { bg: "#150a2e", accent: "#a78bfa", text: "#e2e0f0" },
  },
  clean: {
    name: "Clean",
    description: "Minimal light, professional",
    preview: { bg: "#f8fafc", accent: "#2563eb", text: "#1e293b" },
  },
  ember: {
    name: "Ember",
    description: "Warm dark with amber glow",
    preview: { bg: "#1c1210", accent: "#f59e0b", text: "#fde8d0" },
  },
  terminal: {
    name: "Terminal",
    description: "Green phosphor, retro CRT",
    preview: { bg: "#0a0f0a", accent: "#22c55e", text: "#86efac" },
  },
};

// CSS custom properties for each theme
// Components reference these via var(--sp-*)
export function getThemeCSS(theme: StatusTheme): string {
  const vars = themeVars[theme];
  return Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
}

const themeVars: Record<StatusTheme, Record<string, string>> = {
  midnight: {
    "--sp-bg": "oklch(0.13 0.02 260)",
    "--sp-surface": "rgba(255,255,255,0.03)",
    "--sp-surface-hover": "rgba(255,255,255,0.02)",
    "--sp-border": "rgba(255,255,255,0.06)",
    "--sp-divider": "rgba(255,255,255,0.06)",
    "--sp-text": "rgba(255,255,255,0.9)",
    "--sp-text-2": "rgba(255,255,255,0.5)",
    "--sp-text-3": "rgba(255,255,255,0.25)",
    "--sp-text-4": "rgba(255,255,255,0.15)",
    "--sp-accent": "#2dd4bf",
    "--sp-accent-subtle": "rgba(45,212,191,0.15)",
    "--sp-accent-border": "rgba(45,212,191,0.2)",
    "--sp-warning": "#fbbf24",
    "--sp-warning-subtle": "rgba(251,191,36,0.15)",
    "--sp-warning-border": "rgba(251,191,36,0.2)",
    "--sp-danger": "#f87171",
    "--sp-danger-subtle": "rgba(248,113,113,0.15)",
    "--sp-danger-border": "rgba(248,113,113,0.2)",
    "--sp-bar-up": "rgba(45,212,191,0.8)",
    "--sp-bar-degraded": "rgba(251,191,36,0.8)",
    "--sp-bar-down": "rgba(248,113,113,0.8)",
    "--sp-bar-empty": "rgba(255,255,255,0.06)",
    "--sp-tooltip-bg": "oklch(0.20 0.02 255)",
    "--sp-input-bg": "rgba(255,255,255,0.04)",
    "--sp-input-border": "rgba(255,255,255,0.08)",
    "--sp-font": "inherit",
    "--sp-mono": "var(--font-mono, ui-monospace, monospace)",
    "--sp-glow-1": "oklch(0.55 0.15 195 / 0.12)",
    "--sp-glow-2": "oklch(0.45 0.12 260 / 0.10)",
    "--sp-status-glow": "0 0 8px",
  },
  aurora: {
    "--sp-bg": "oklch(0.10 0.04 290)",
    "--sp-surface": "rgba(139,92,246,0.05)",
    "--sp-surface-hover": "rgba(139,92,246,0.03)",
    "--sp-border": "rgba(139,92,246,0.12)",
    "--sp-divider": "rgba(139,92,246,0.08)",
    "--sp-text": "rgba(237,233,254,0.92)",
    "--sp-text-2": "rgba(196,181,253,0.55)",
    "--sp-text-3": "rgba(196,181,253,0.28)",
    "--sp-text-4": "rgba(196,181,253,0.15)",
    "--sp-accent": "#a78bfa",
    "--sp-accent-subtle": "rgba(167,139,250,0.15)",
    "--sp-accent-border": "rgba(167,139,250,0.25)",
    "--sp-warning": "#fb923c",
    "--sp-warning-subtle": "rgba(251,146,60,0.15)",
    "--sp-warning-border": "rgba(251,146,60,0.2)",
    "--sp-danger": "#fb7185",
    "--sp-danger-subtle": "rgba(251,113,133,0.15)",
    "--sp-danger-border": "rgba(251,113,133,0.2)",
    "--sp-bar-up": "rgba(167,139,250,0.75)",
    "--sp-bar-degraded": "rgba(251,146,60,0.75)",
    "--sp-bar-down": "rgba(251,113,133,0.75)",
    "--sp-bar-empty": "rgba(139,92,246,0.08)",
    "--sp-tooltip-bg": "oklch(0.14 0.04 285)",
    "--sp-input-bg": "rgba(139,92,246,0.06)",
    "--sp-input-border": "rgba(139,92,246,0.15)",
    "--sp-font": "inherit",
    "--sp-mono": "var(--font-mono, ui-monospace, monospace)",
    "--sp-glow-1": "oklch(0.50 0.20 300 / 0.15)",
    "--sp-glow-2": "oklch(0.55 0.18 330 / 0.12)",
    "--sp-status-glow": "0 0 10px",
  },
  clean: {
    "--sp-bg": "#f8fafc",
    "--sp-surface": "#ffffff",
    "--sp-surface-hover": "#f1f5f9",
    "--sp-border": "#e2e8f0",
    "--sp-divider": "#e2e8f0",
    "--sp-text": "#0f172a",
    "--sp-text-2": "#64748b",
    "--sp-text-3": "#94a3b8",
    "--sp-text-4": "#cbd5e1",
    "--sp-accent": "#2563eb",
    "--sp-accent-subtle": "rgba(37,99,235,0.08)",
    "--sp-accent-border": "rgba(37,99,235,0.2)",
    "--sp-warning": "#d97706",
    "--sp-warning-subtle": "rgba(217,119,6,0.08)",
    "--sp-warning-border": "rgba(217,119,6,0.2)",
    "--sp-danger": "#dc2626",
    "--sp-danger-subtle": "rgba(220,38,38,0.08)",
    "--sp-danger-border": "rgba(220,38,38,0.2)",
    "--sp-bar-up": "#2563eb",
    "--sp-bar-degraded": "#d97706",
    "--sp-bar-down": "#dc2626",
    "--sp-bar-empty": "#e2e8f0",
    "--sp-tooltip-bg": "#ffffff",
    "--sp-input-bg": "#ffffff",
    "--sp-input-border": "#e2e8f0",
    "--sp-font": "inherit",
    "--sp-mono": "var(--font-mono, ui-monospace, monospace)",
    "--sp-glow-1": "transparent",
    "--sp-glow-2": "transparent",
    "--sp-status-glow": "none",
  },
  ember: {
    "--sp-bg": "oklch(0.13 0.03 40)",
    "--sp-surface": "rgba(251,146,60,0.04)",
    "--sp-surface-hover": "rgba(251,146,60,0.02)",
    "--sp-border": "rgba(251,146,60,0.10)",
    "--sp-divider": "rgba(251,146,60,0.08)",
    "--sp-text": "rgba(254,243,199,0.9)",
    "--sp-text-2": "rgba(253,230,138,0.5)",
    "--sp-text-3": "rgba(253,230,138,0.25)",
    "--sp-text-4": "rgba(253,230,138,0.12)",
    "--sp-accent": "#f59e0b",
    "--sp-accent-subtle": "rgba(245,158,11,0.15)",
    "--sp-accent-border": "rgba(245,158,11,0.25)",
    "--sp-warning": "#fb923c",
    "--sp-warning-subtle": "rgba(251,146,60,0.15)",
    "--sp-warning-border": "rgba(251,146,60,0.2)",
    "--sp-danger": "#ef4444",
    "--sp-danger-subtle": "rgba(239,68,68,0.15)",
    "--sp-danger-border": "rgba(239,68,68,0.2)",
    "--sp-bar-up": "rgba(245,158,11,0.8)",
    "--sp-bar-degraded": "rgba(251,146,60,0.8)",
    "--sp-bar-down": "rgba(239,68,68,0.8)",
    "--sp-bar-empty": "rgba(251,146,60,0.06)",
    "--sp-tooltip-bg": "oklch(0.17 0.03 35)",
    "--sp-input-bg": "rgba(251,146,60,0.04)",
    "--sp-input-border": "rgba(251,146,60,0.12)",
    "--sp-font": "inherit",
    "--sp-mono": "var(--font-mono, ui-monospace, monospace)",
    "--sp-glow-1": "oklch(0.55 0.15 50 / 0.12)",
    "--sp-glow-2": "oklch(0.50 0.18 30 / 0.08)",
    "--sp-status-glow": "0 0 8px",
  },
  terminal: {
    "--sp-bg": "oklch(0.08 0.02 145)",
    "--sp-surface": "rgba(34,197,94,0.04)",
    "--sp-surface-hover": "rgba(34,197,94,0.02)",
    "--sp-border": "rgba(34,197,94,0.12)",
    "--sp-divider": "rgba(34,197,94,0.08)",
    "--sp-text": "rgba(134,239,172,0.95)",
    "--sp-text-2": "rgba(34,197,94,0.6)",
    "--sp-text-3": "rgba(34,197,94,0.3)",
    "--sp-text-4": "rgba(34,197,94,0.15)",
    "--sp-accent": "#22c55e",
    "--sp-accent-subtle": "rgba(34,197,94,0.12)",
    "--sp-accent-border": "rgba(34,197,94,0.25)",
    "--sp-warning": "#eab308",
    "--sp-warning-subtle": "rgba(234,179,8,0.12)",
    "--sp-warning-border": "rgba(234,179,8,0.2)",
    "--sp-danger": "#ef4444",
    "--sp-danger-subtle": "rgba(239,68,68,0.12)",
    "--sp-danger-border": "rgba(239,68,68,0.2)",
    "--sp-bar-up": "rgba(34,197,94,0.75)",
    "--sp-bar-degraded": "rgba(234,179,8,0.75)",
    "--sp-bar-down": "rgba(239,68,68,0.75)",
    "--sp-bar-empty": "rgba(34,197,94,0.06)",
    "--sp-tooltip-bg": "oklch(0.10 0.02 145)",
    "--sp-input-bg": "rgba(34,197,94,0.04)",
    "--sp-input-border": "rgba(34,197,94,0.15)",
    "--sp-font": "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace",
    "--sp-mono": "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace",
    "--sp-glow-1": "rgba(34,197,94,0.08)",
    "--sp-glow-2": "rgba(34,197,94,0.05)",
    "--sp-status-glow": "0 0 10px",
  },
};

// Additional wrapper classes per theme (for effects that can't be CSS vars)
export function getThemeWrapperClass(theme: StatusTheme): string {
  const base = "min-h-screen relative overflow-hidden";
  if (theme === "clean") {
    return base; // no dark mode for clean
  }
  return `${base} dark`;
}

export function isLightTheme(theme: StatusTheme): boolean {
  return theme === "clean";
}
