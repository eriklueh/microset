import { ArrowUp, X } from "lucide-react";
import { useUpdater } from "@/hooks/useUpdater";
import { useT } from "@/lib/i18n";

/**
 * Manifiesto update prompt. Renders only when a newer signed release is found.
 * Lives in the main window (mounted from App). One click downloads, installs and
 * relaunches.
 */
export function UpdateBanner() {
  const u = useUpdater();
  const t = useT();
  if (!u.available) return null;

  const busy = u.phase === "downloading";
  const failed = u.phase === "error";

  return (
    <div className="fixed right-4 bottom-4 z-50 w-[300px] border border-[var(--rule2)] bg-[var(--bg)] text-[var(--fg)] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]">
      <div className="absolute inset-y-0 left-0 w-1.5 bg-[var(--acc)]" />
      <div className="flex items-start justify-between gap-2 py-2.5 pr-2 pl-4">
        <div className="flex items-center gap-1.5">
          <ArrowUp className="size-3.5 text-[var(--acc)]" strokeWidth={3} />
          <span className="font-mono text-[9.5px] font-semibold tracking-[0.2em] text-[var(--acc)]">
            {t.update.label}
          </span>
        </div>
        {!busy && (
          <button
            onClick={u.dismiss}
            aria-label="Descartar"
            className="text-[var(--faint2)] hover:text-[var(--fg)]"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <div className="px-4 pb-3.5">
        <div className="text-[15px] leading-tight font-extrabold tracking-[-0.01em]">
          {t.update.newVersion} {u.version}
        </div>
        <div className="mt-1 font-mono text-[10px] tracking-[0.04em] text-[var(--faint)]">
          {failed ? t.update.failed : busy ? `${t.update.downloading} ${u.pct}%` : t.update.ready}
        </div>

        {busy ? (
          <div className="mt-3 flex h-[3px] w-full">
            <div className="bg-[var(--acc)]" style={{ width: `${u.pct}%` }} />
            <div className="flex-1 bg-[var(--bar0)]" />
          </div>
        ) : (
          <button
            onClick={() => void u.install()}
            className="mt-3 flex w-full items-center justify-center gap-1.5 bg-[var(--acc)] py-2 font-mono text-[11px] font-bold tracking-[0.06em] text-[var(--on)] hover:opacity-90"
          >
            <ArrowUp className="size-3.5" strokeWidth={3} />
            {failed ? t.update.retry : t.update.install}
          </button>
        )}
      </div>
    </div>
  );
}
