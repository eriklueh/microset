import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";
import type {
  Adaptation,
  Modality,
  Session,
  SessionLocation,
} from "@/modules/entreno/entreno";
import { useCatalog } from "@/hooks/useCatalog";
import { useT } from "@/lib/i18n";
import { useStore } from "@/store/useStore";

/**
 * SPORT EDITOR — the design-only editor for a "deporte" (external Entreno activity),
 * reused inside Rutina's activity library (VISION §7 "Modelo de superficies"). Rutina is
 * PURE DESIGN: here you only DEFINE a sport (modality · location · duration · intensity).
 * Assigning it to days and marking it hecho/no-hecho lives in Calendario; the live day
 * lives in Hoy — so this editor carries no runtime state (no done/skipped/adaptation).
 * Gated by `modules.entreno.enabled` at the call site; off → Rutina shows only day-types.
 */

const inputCls =
  "border border-[var(--rule2)] bg-transparent text-[var(--fg)] outline-none focus:border-[var(--acc)]";
const MODALITIES: Modality[] = ["calisthenics", "strength", "sport", "cardio"];
const LOCATIONS: SessionLocation[] = ["home", "away"];

/** Minutes-of-day → "HH:MM". */
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
/** "HH:MM" → minutes-of-day. */
const parseHHMM = (s: string): number => {
  const [h, mm] = s.split(":").map((n) => parseInt(n, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(mm) ? mm : 0);
};

/** Edit a single sport (external session) — the right working pane when a sport tab is active. */
export function SportEditor({ session, onDeleted }: { session: Session; onDeleted: () => void }) {
  const t = useT();
  const updateEntrenoSession = useStore((s) => s.updateEntrenoSession);
  const removeEntrenoSession = useStore((s) => s.removeEntrenoSession);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
        <div className="flex flex-wrap gap-7">
          <Labeled label={t.entreno.nameLabel}>
            <input
              type="text"
              value={session.name ?? ""}
              onChange={(e) => updateEntrenoSession(session.id, { name: e.currentTarget.value })}
              placeholder={t.entreno.modalities[session.modality]}
              aria-label={t.entreno.nameLabel}
              className={`${inputCls} w-40 px-3 py-2.5 font-mono text-[13px] placeholder:text-[var(--faint2)]`}
            />
          </Labeled>
          <Labeled label={t.entreno.modality}>
            <select
              value={session.modality}
              onChange={(e) => updateEntrenoSession(session.id, { modality: e.currentTarget.value as Modality })}
              aria-label={t.entreno.modality}
              className={`${inputCls} appearance-none px-3 py-2.5 font-mono text-[13px]`}
            >
              {MODALITIES.map((m) => (
                <option key={m} value={m} className="bg-[var(--ink2)]">
                  {t.entreno.modalities[m]}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label={t.entreno.location}>
            <select
              value={session.location}
              onChange={(e) => updateEntrenoSession(session.id, { location: e.currentTarget.value as SessionLocation })}
              aria-label={t.entreno.location}
              className={`${inputCls} appearance-none px-3 py-2.5 font-mono text-[13px]`}
            >
              {LOCATIONS.map((l) => (
                <option key={l} value={l} className="bg-[var(--ink2)]">
                  {t.entreno.locations[l]}
                </option>
              ))}
            </select>
          </Labeled>
        </div>

        {session.external && (
          <div className="mt-7 flex flex-wrap gap-7">
            <Labeled label={t.entreno.startLabel}>
              <input
                type="time"
                value={session.window ? hhmm(session.window.start) : ""}
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  updateEntrenoSession(session.id, v ? { startMin: parseHHMM(v) } : { window: null });
                }}
                aria-label={t.entreno.startLabel}
                className={`${inputCls} px-3 py-2.5 font-mono text-[13px] [color-scheme:dark]`}
              />
            </Labeled>
            <Labeled label={t.entreno.duration}>
              <span className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={600}
                  step={5}
                  value={session.durationMin}
                  onChange={(e) => updateEntrenoSession(session.id, { durationMin: Number(e.currentTarget.value) })}
                  aria-label={t.entreno.duration}
                  className={`${inputCls} w-20 px-3 py-2.5 text-center font-mono text-[13px]`}
                />
                <span className="font-mono text-[10px] text-[var(--faint2)]">{t.entreno.min}</span>
              </span>
            </Labeled>
            <Labeled label={t.entreno.intensity}>
              <span className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(session.intensity * 100)}
                  onChange={(e) => updateEntrenoSession(session.id, { intensity: Number(e.currentTarget.value) / 100 })}
                  aria-label={t.entreno.intensity}
                  className={`${inputCls} w-20 px-3 py-2.5 text-center font-mono text-[13px]`}
                />
                <span className="font-mono text-[10px] text-[var(--faint2)]">%</span>
              </span>
            </Labeled>
          </div>
        )}

        <p className="mt-8 max-w-[52ch] text-[12.5px] leading-[1.65] text-[var(--faint)]">
          {t.routine.sportHint}
        </p>
      </div>

      <div className="flex flex-none items-center justify-end border-t border-[var(--rule2)] px-7 py-3.5">
        <button
          onClick={() => {
            removeEntrenoSession(session.id);
            onDeleted();
          }}
          className="flex items-center gap-2 border border-[var(--rule2)] px-4 py-2.5 font-mono text-[11px] font-semibold tracking-[0.06em] text-[var(--dim)] hover:border-[var(--destructive)] hover:text-[var(--destructive)]"
        >
          <Trash2 className="size-3.5" /> {t.entreno.delete}
        </button>
      </div>
    </section>
  );
}

/** The motive-aware adaptation readout (kind + note + home circuit). Shared with Calendario/Hoy. */
export function AdaptationPanel({ adapt }: { adapt: Adaptation }) {
  const t = useT();
  const { name } = useCatalog();
  const kindLabel =
    adapt.kind === "rest"
      ? t.entreno.adaptKindRest
      : adapt.kind === "mobility"
        ? t.entreno.adaptKindMobility
        : t.entreno.adaptKindSubstitute;

  return (
    <div
      className="mt-3 border-l-2 border-[var(--acc)] p-3"
      style={{ background: "color-mix(in oklch, var(--acc) 6%, transparent)" }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[9px] tracking-[0.16em] text-[var(--acc)]">{t.entreno.adaptTitle}</span>
        <span className="border border-[var(--acc)] px-2 py-0.5 font-mono text-[9px] tracking-[0.1em] text-[var(--acc)]">
          {kindLabel}
        </span>
        <span className="font-mono text-[9px] tracking-[0.1em] text-[var(--faint2)]">
          {adapt.addsLoad ? t.entreno.addsLoad : t.entreno.noLoad}
        </span>
      </div>
      <p className="mt-2 text-[12px] leading-[1.5] text-[var(--dim)]">{adapt.note}</p>
      {adapt.skillDropped && (
        <div className="mt-1 font-mono text-[9px] tracking-[0.1em] text-[var(--faint2)]">{t.entreno.skillDropped}</div>
      )}
      {adapt.circuit.length > 0 ? (
        <div className="mt-3">
          <div className="mb-1.5 font-mono text-[9px] tracking-[0.16em] text-[var(--faint)]">{t.entreno.circuit}</div>
          <div className="flex flex-col">
            {adapt.circuit.map((it) => (
              <div
                key={it.exerciseId}
                className="flex items-center justify-between gap-2 border-b border-[var(--rule)] py-1.5 last:border-b-0"
              >
                <span className="truncate text-[13px] font-semibold text-[var(--fg)]">{name(it.exerciseId)}</span>
                <span className="font-mono text-[10px] text-[var(--faint)]">{it.sets}×</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        adapt.kind === "substitute" && (
          <div className="mt-2 font-mono text-[10px] text-[var(--faint2)]">{t.entreno.emptyCircuit}</div>
        )
      )}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[9px] tracking-[0.14em] text-[var(--faint2)]">{label}</span>
      {children}
    </div>
  );
}
