import { useT } from "@/lib/i18n";

/**
 * Marathon "lenguaje HUD" — the shared chrome kit (corner brackets, register
 * marks, barcodes, the relay bar, the brand ticker). Loud where it matters,
 * sober where it breathes. See docs/design + the Manifiesto Marathon spec.
 */

/** Lime L-shaped register brackets in the four corners of a `relative` box. */
export function Corners() {
  const pos: [string, string][] = [
    ["top-1 left-1", "border-t border-l"],
    ["top-1 right-1", "border-t border-r"],
    ["bottom-1 left-1", "border-b border-l"],
    ["bottom-1 right-1", "border-b border-r"],
  ];
  return (
    <>
      {pos.map(([p, b]) => (
        <span key={p} className={`pointer-events-none absolute z-[2] size-2.5 ${p} ${b} border-[var(--acc)]`} />
      ))}
    </>
  );
}

/** A single faint "+" register mark, absolutely positioned via className. */
export function RegMark({ className = "" }: { className?: string }) {
  return (
    <span className={`pointer-events-none absolute z-[2] text-[15px] leading-none font-light text-[var(--rule2)] ${className}`}>
      +
    </span>
  );
}

/** Thin barcode mark for HUD strips. */
export function Barcode({ color = "var(--faint2)", height = 11 }: { color?: string; height?: number }) {
  return (
    <span className="inline-flex items-end gap-px align-middle" style={{ height }}>
      {[2, 1, 3, 1, 2, 4, 1, 2, 1, 3].map((w, i) => (
        <span key={i} style={{ width: w, height, background: color }} />
      ))}
    </span>
  );
}

/** Section divider: `[ 0N ] LABEL ──────── RIGHT`. */
export function SectionRule({ index, label, right }: { index: number; label: string; right?: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="font-mono text-[11px] font-semibold tracking-[0.22em] text-[var(--acc)]">
        [ {String(index).padStart(2, "0")} ] {label}
      </span>
      <span className="h-px flex-1 bg-[var(--rule)]" />
      {right && <span className="font-mono text-[9.5px] tracking-[0.12em] text-[var(--faint2)]">{right}</span>}
    </div>
  );
}

/** Vertical lime relay bar pinned to the right edge of the shell. */
export function RelayBar() {
  const t = useT();
  return (
    <div className="flex w-[28px] flex-none flex-col items-center justify-between bg-[var(--acc)] py-3.5">
      <span className="size-2 bg-[var(--on)]" />
      <div
        className="font-pixel text-[12px] tracking-[0.08em] text-[var(--on)]"
        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
      >
        {t.shell.relay}
      </div>
      <div className="grid grid-cols-2 gap-px" style={{ gridAutoRows: "4px" }}>
        <span className="size-1 bg-[var(--on)]" />
        <span className="size-1" />
        <span className="size-1" />
        <span className="size-1 bg-[var(--on)]" />
      </div>
    </div>
  );
}

