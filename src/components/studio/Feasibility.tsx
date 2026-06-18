import { useT } from "@/lib/i18n";

/**
 * Canonical "does the planned volume fit your work window?" UI. One vocabulary + one set of
 * colors, shared by Rutina / Hoy / Coach so the feasibility readout never drifts between views.
 * The math lives in `@/coach/analysis` (`analyzeRoutine`); this is only the presentation.
 */

const WARN = "#e0a400";

/** Inline chip: `TODO ENTRA ✓` (lime) · `NO ENTRA · 6/8` (amber) · `VACÍO` (faint). */
export function FeasibilityTag({ fits, total, className = "" }: { fits: number; total: number; className?: string }) {
  const t = useT();
  const empty = total === 0;
  const ok = fits >= total;
  const color = empty ? "var(--faint2)" : ok ? "var(--acc)" : WARN;
  const label = empty
    ? t.feasibility.empty
    : ok
      ? `${t.feasibility.all} ✓`
      : `${t.feasibility.wontFit} · ${fits}/${total}`;
  return (
    <span
      className={`font-mono text-[11px] font-semibold tracking-[0.06em] ${className}`}
      title={empty || ok ? undefined : t.feasibility.hint}
      style={{ color }}
    >
      {label}
    </span>
  );
}

/** The always-visible "why + fix" line, shown when a day's volume doesn't fit. */
export function FeasibilityHint({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <span className={`block font-mono text-[10px] leading-[1.45] tracking-[0.03em] text-[var(--faint)] ${className}`}>
      {t.feasibility.hint}
    </span>
  );
}
