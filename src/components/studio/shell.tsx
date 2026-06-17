import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

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
