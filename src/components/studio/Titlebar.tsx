import { getCurrentWindow } from "@tauri-apps/api/window";
import { useT } from "@/lib/i18n";

/** Custom titlebar styled as the Marathon "system bar" (native one is off via decorations:false). */
export function Titlebar({ label }: { label?: string }) {
  const win = getCurrentWindow();
  const t = useT();
  return (
    <div
      data-tauri-drag-region
      className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--rule2)] bg-[var(--bg)] pr-1.5 pl-3 select-none"
    >
      <div className="pointer-events-none flex items-center gap-3 font-mono text-[9.5px] tracking-[0.16em] text-[var(--faint2)]">
        <span className="size-3 bg-[var(--acc)]" />
        <span>MICROSET // {(label ?? "STUDIO").toUpperCase()}</span>
        <span className="opacity-60">v2.6.0</span>
        <span className="opacity-60">EXEC 0x28·93</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="pointer-events-none flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.16em] text-[var(--acc)]">
          <span className="ms-blink inline-block size-1.5 bg-[var(--acc)]" />
          {t.shell.online}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => void win.minimize()}
            className="flex h-[30px] w-[34px] items-center justify-center hover:bg-[var(--bar1)]"
            aria-label="Minimizar"
          >
            <span className="h-[1.5px] w-[11px] bg-[var(--faint)]" />
          </button>
          <button
            onClick={() => void win.toggleMaximize()}
            className="flex h-[30px] w-[34px] items-center justify-center hover:bg-[var(--bar1)]"
            aria-label="Maximizar"
          >
            <span className="size-[10px] border-[1.5px] border-[var(--faint)]" />
          </button>
          <button
            onClick={() => void win.hide()}
            className="group flex h-[30px] w-[34px] items-center justify-center hover:bg-[#e53935]"
            aria-label="Cerrar"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              className="text-[var(--faint)] group-hover:text-white"
            >
              <line x1="1.5" y1="1.5" x2="10.5" y2="10.5" />
              <line x1="10.5" y1="1.5" x2="1.5" y2="10.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
