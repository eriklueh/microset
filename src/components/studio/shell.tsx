import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Barcode, Corners, RegMark } from "./hud";

/**
 * Shared view chrome so EVERY Studio view places its masthead and (when present)
 * its model rail at the same coordinates — no shift when navigating. The header
 * has a fixed min-height that anchors the body split below it; the rail is always
 * the same width. Title size + kicker line are constant across views.
 */

/** Fixed left-rail (the "model"/context) — identical width + padding in every view. */
export const RAIL_CLASS =
  "flex w-[340px] flex-none flex-col gap-4 overflow-y-auto border-r border-[var(--rule2)] p-6";

/** Body figure width inside the rail — constant so the model sits at the same place. */
export const RAIL_BODY_W = 150;

export function ViewHeader({
  kicker,
  title,
  titleMuted,
  onBack,
  backLabel,
  right,
  context,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  titleMuted?: boolean;
  onBack?: () => void;
  backLabel?: string;
  right?: ReactNode;
  context?: ReactNode;
}) {
  return (
    <div
      className="flex flex-none flex-col overflow-hidden border-b border-[var(--rule2)] px-7 pt-[15px]"
      style={{ height: 104 }}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {onBack && (
            <button onClick={onBack} aria-label={backLabel} className="flex-none text-[var(--acc)] hover:opacity-70">
              <ArrowLeft className="size-4" />
            </button>
          )}
          <div className="min-w-0">
            <div className="mb-1 truncate font-mono text-[10px] tracking-[0.14em] text-[var(--faint)]">{kicker}</div>
            <h1
              className="m-0 truncate text-[26px] leading-none font-extrabold tracking-[-0.035em] uppercase"
              style={{ color: titleMuted ? "var(--faint2)" : "var(--fg)" }}
            >
              {title}
            </h1>
          </div>
        </div>
        {right && <div className="flex flex-none items-center gap-3">{right}</div>}
      </div>
      {context && <div className="mt-3 min-w-0">{context}</div>}
    </div>
  );
}

/**
 * Contextual cockpit rail for the body-less views (Equipo / Ajustes). Same left-anchor
 * coordinates + HUD chrome (corners, register mark, barcode, scanline-free) as the model
 * rail, so navigating between cockpit views doesn't shift the layout. `meta` is the small
 * status line under the label; `children` is the per-view readout (counters / hints).
 */
export function CockpitRail({
  label,
  meta,
  children,
}: {
  label: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <aside className={RAIL_CLASS}>
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] font-semibold tracking-[0.2em] text-[var(--faint)]">
          {label}
        </span>
        {meta && (
          <span className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.12em] text-[var(--faint2)]">
            {meta}
          </span>
        )}
      </div>
      <div className="relative border border-[var(--rule2)] p-5">
        <Corners />
        <RegMark className="top-2 left-1/2 -translate-x-1/2" />
        {children}
        <div className="mt-5 flex items-center justify-between border-t border-[var(--rule)] pt-3">
          <Barcode color="var(--faint2)" height={10} />
          <span className="font-mono text-[8.5px] tracking-[0.16em] text-[var(--faint2)]">
            0x28·93
          </span>
        </div>
      </div>
    </aside>
  );
}

/** Big pixel readout pair (value + unit) for the cockpit rail. */
export function RailStat({ value, unit }: { value: ReactNode; unit: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-pixel text-[40px] leading-[0.8] tabular-nums text-[var(--fg)]">{value}</span>
      <span className="font-mono text-[9px] tracking-[0.12em] text-[var(--faint2)] uppercase">{unit}</span>
    </div>
  );
}
