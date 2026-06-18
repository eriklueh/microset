import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { formatMinute } from "@/lib/engine";
import { exerciseContext } from "@/domain/seed";
import { useCatalog } from "@/hooks/useCatalog";
import { useT } from "@/lib/i18n";
import { useStore } from "@/store/useStore";
import { closeToastWindow, openToastWindow } from "@/lib/windows";
import { Barcode } from "@/components/studio/hud";

/** Auto-dismiss the toast if there's no answer after this long. */
const AUTO_DISMISS_MS = 45_000;

/**
 * Custom toast reminder (Manifiesto). Rendered in its own borderless,
 * always-on-top window. It drives its own OS-window visibility from
 * `toastBlockId`: shows + positions when a set is due, hides when answered or
 * after a timeout. The actual notification look is fully ours, identical on
 * Windows and Hyprland.
 */
export function Toast() {
  const day = useStore((s) => s.day);
  const toastBlockId = useStore((s) => s.toastBlockId);
  const done = useStore((s) => s.done);
  const snooze = useStore((s) => s.snooze);
  const skip = useStore((s) => s.skip);
  const dismissToast = useStore((s) => s.dismissToast);
  const snoozeMinutes = useStore((s) => s.snoozeMinutes);
  const { byId, name, variantLabel } = useCatalog();
  const t = useT();
  const [deplete, setDeplete] = useState(false);

  const block = day?.blocks.find(
    (b) => b.id === toastBlockId && b.status !== "done" && b.status !== "skipped",
  );

  useEffect(() => {
    if (!block) {
      void closeToastWindow();
      return;
    }
    void openToastWindow();
    const handle = setTimeout(() => dismissToast(), AUTO_DISMISS_MS);
    return () => clearTimeout(handle);
  }, [block?.id, dismissToast]);

  // Drive the auto-dismiss hairline: full on a new block, then deplete to 0 over the timeout.
  useEffect(() => {
    if (!block) return;
    setDeplete(false);
    const handle = setTimeout(() => setDeplete(true), 40);
    return () => clearTimeout(handle);
  }, [block?.id]);

  if (!block) return <div className="h-screen w-screen bg-[var(--bg)]" />;

  const ex = byId(block.exerciseId);
  const desk = ex ? exerciseContext(ex) === "desk" : false;
  const muscle = ex ? t.muscle[ex.muscle].toUpperCase() : "";
  const reps = block.target ?? ex?.defaultReps ?? "";
  const meta = [
    desk ? t.context.desk.toUpperCase() : muscle,
    reps ? `${reps} ${t.toast.reps}` : "",
    variantLabel(block.exerciseId, block.variantId).toUpperCase(),
  ]
    .filter(Boolean)
    .join(" · ");

  const act = (fn: (id: string) => void) => {
    fn(block.id);
    dismissToast();
  };

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden border border-[var(--rule2)] bg-[var(--bg)] text-[var(--fg)] select-none">
      <div className="absolute inset-y-0 left-0 z-[2] w-1.5 bg-[var(--acc)]" />
      {/* faint telemetry field behind the content */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, color-mix(in oklch, var(--faint2) 13%, transparent) 1px, transparent 1.5px)",
          backgroundSize: "13px 13px",
        }}
      />

      <div
        data-tauri-drag-region
        className="relative z-[1] flex h-[22px] flex-none cursor-grab items-center justify-between pr-2 pl-3.5 active:cursor-grabbing"
      >
        <div className="pointer-events-none flex items-center gap-2">
          <Barcode color="var(--acc)" height={8} />
          <span className="font-mono text-[9px] font-bold tracking-[0.2em] text-[var(--faint)]">
            microset
          </span>
        </div>
        <button
          onClick={() => dismissToast()}
          aria-label="Descartar"
          className="text-[var(--faint2)] hover:text-[var(--fg)]"
        >
          <X className="size-3" />
        </button>
      </div>

      <div className="relative z-[1] flex flex-1 flex-col gap-0.5 py-1.5 pr-3 pl-3.5">
        <div className="font-mono text-[9px] font-semibold tracking-[0.2em] text-[var(--acc)]">
          {t.toast.now} · {formatMinute(block.time)}
        </div>
        <div className="truncate text-[24px] leading-[0.95] font-extrabold tracking-[-0.02em] uppercase">
          {name(block.exerciseId)}
        </div>
        {meta && (
          <div className="truncate font-mono text-[9.5px] tracking-[0.04em] text-[var(--faint)]">
            {meta}
          </div>
        )}

        <div className="mt-auto flex gap-1.5">
          <button
            onClick={() => act(done)}
            className="flex flex-1 items-center justify-center gap-1 bg-[var(--acc)] py-1.5 font-mono text-[10px] font-bold tracking-[0.06em] text-[var(--on)]"
          >
            <Check className="size-3" strokeWidth={3} /> {t.actions.done}
          </button>
          <button
            onClick={() => act((id) => snooze(id, snoozeMinutes))}
            className="border border-[var(--rule2)] px-2.5 py-1.5 font-mono text-[10px] font-semibold tracking-[0.06em] text-[var(--dim)] hover:border-[var(--fg)] hover:text-[var(--fg)]"
          >
            {t.actions.later}
          </button>
          <button
            onClick={() => act(skip)}
            className="border border-[var(--rule2)] px-2.5 py-1.5 font-mono text-[10px] font-semibold tracking-[0.06em] text-[var(--dim)] hover:border-[var(--fg)] hover:text-[var(--fg)]"
          >
            {t.actions.skip}
          </button>
        </div>
      </div>

      {/* auto-dismiss countdown hairline (depletes over AUTO_DISMISS_MS) */}
      <div className="absolute bottom-0 left-1.5 right-0 z-[2] h-[2px] bg-[var(--bar0)]">
        <div
          className="h-full bg-[var(--acc)]"
          style={{ width: deplete ? "0%" : "100%", transition: `width ${AUTO_DISMISS_MS}ms linear` }}
        />
      </div>
    </div>
  );
}
