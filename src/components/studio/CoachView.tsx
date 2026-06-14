import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Masthead } from "./Masthead";
import { openCoach } from "@/lib/windows";
import { useStore } from "@/store/useStore";
import type { MuscleGroup } from "@/domain/types";
import { applyChanges, humanizeChange, type ProposedChange } from "@/coach/changes";
import { getProvider, type CoachMessage } from "@/coach/provider";
import { coachSnapshot } from "@/coach/snapshot";

const GROUPS: MuscleGroup[] = ["pull", "push", "core", "legs"];
const MUSCLE_COLOR: Record<MuscleGroup, string> = {
  pull: "oklch(0.70 0.14 235)",
  push: "oklch(0.80 0.15 75)",
  core: "oklch(0.66 0.18 295)",
  legs: "oklch(0.78 0.18 142)",
};
const WARN = "#e0a400";
const field =
  "w-full resize-none border border-[var(--rule2)] bg-transparent px-3 py-2.5 text-[13.5px] leading-[1.5] text-[var(--fg)] outline-none focus:border-[var(--acc)] placeholder:text-[var(--faint2)]";

export function CoachView({ onStart }: { onStart: () => void }) {
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const coach = useStore((s) => s.coach);
  const setCoachConfig = useStore((s) => s.setCoachConfig);

  // Subscribe to the slices the snapshot reads so it recomputes on apply.
  const dayTypes = useStore((s) => s.dayTypes);
  const week = useStore((s) => s.week);
  const logs = useStore((s) => s.logs);
  const settings = useStore((s) => s.settings);
  const owned = useStore((s) => s.ownedEquipment);
  const snap = useMemo(() => coachSnapshot(), [dayTypes, week, logs, settings, owned]);

  const profileFilled = !!(profile.goals || profile.diet || profile.constraints);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ProposedChange[] | null>(null);
  const [showProvider, setShowProvider] = useState(false);
  const [showProfile, setShowProfile] = useState(!profileFilled);

  const send = async (text: string = input) => {
    const t = text.trim();
    if (!t || busy) return;
    setError(null);
    setPending(null);
    const next = [...messages, { role: "user" as const, content: t }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const reply = await getProvider().complete(next);
      setMessages((m) => [...m, { role: "assistant", content: reply.text || "(propone cambios)" }]);
      if (reply.changes.length) setPending(reply.changes);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const approve = () => {
    if (!pending) return;
    const results = applyChanges(pending);
    setMessages((m) => [...m, { role: "assistant", content: `Aplicado:\n- ${results.join("\n- ")}` }]);
    setPending(null);
  };
  const discard = () => {
    setMessages((m) => [...m, { role: "assistant", content: "Cambios descartados." }]);
    setPending(null);
  };

  const balTotal = GROUPS.reduce((n, g) => n + snap.balance[g], 0);
  const chips = [
    "Armá mi semana para mi objetivo",
    ...(snap.feasibilityOk ? [] : ["No me entra el volumen, ajustalo"]),
    ...(snap.balanceLabel.startsWith("Falta") ? ["Equilibrá los músculos"] : []),
    ...(snap.readyToLevel.length ? [`¿Subo de nivel en ${snap.readyToLevel[0]}?`] : []),
    "Tengo una molestia hoy",
  ];

  return (
    <div className="flex flex-col px-[34px] py-[30px]">
      <Masthead title="COACH" sub="TU ENTRENADOR" />

      {/* Awareness: what the coach sees */}
      <div className="border border-[var(--rule2)]">
        <div className="flex items-center justify-between border-b border-[var(--rule2)] px-4 py-2.5">
          <span className="font-mono text-[10px] font-semibold tracking-[0.16em] text-[var(--faint)]">
            LO QUE VEO
          </span>
          <span className="font-mono text-[10px] tracking-[0.08em] text-[var(--faint2)]">
            HOY · {(snap.todayName ?? "—").toUpperCase()}
          </span>
        </div>
        <div className="grid grid-cols-3">
          <Tile label="SEMANA" value={`${snap.activeDays}`} sub="DÍAS ACTIVOS" />
          <Tile
            label="FACTIBILIDAD"
            value={snap.feasibilityOk ? "OK" : "AJUSTAR"}
            valueColor={snap.feasibilityOk ? "var(--acc)" : WARN}
            sub={snap.feasibilityOk ? "TODO ENTRA" : `NO ENTRA: ${snap.overflow.join(", ").toUpperCase()}`}
            border
          />
          <Tile
            label="PROGRESO"
            value={snap.readyToLevel.length ? "LISTO" : `${snap.thisWeekSets}`}
            valueColor={snap.readyToLevel.length ? "var(--acc)" : "var(--fg)"}
            sub={snap.readyToLevel.length ? `SUBIR: ${snap.readyToLevel[0].toUpperCase()}` : "SERIES (7 DÍAS)"}
            border
          />
        </div>
        <div className="border-t border-[var(--rule2)] px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-[0.12em] text-[var(--faint)]">BALANCE</span>
            <span
              className="font-mono text-[10px] tracking-[0.08em]"
              style={{ color: snap.balanceLabel.startsWith("Falta") ? WARN : "var(--faint2)" }}
            >
              {snap.balanceLabel.toUpperCase()}
            </span>
          </div>
          {balTotal > 0 ? (
            <div className="flex h-[6px] gap-px">
              {GROUPS.map((g) =>
                snap.balance[g] > 0 ? (
                  <div
                    key={g}
                    style={{ width: `${(snap.balance[g] / balTotal) * 100}%`, background: MUSCLE_COLOR[g] }}
                  />
                ) : null,
              )}
            </div>
          ) : (
            <div className="h-[6px] bg-[var(--bar0)]" />
          )}
        </div>
      </div>

      {/* Context-aware suggestions */}
      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c}
            onClick={() => void send(c)}
            disabled={busy}
            className="border border-[var(--rule2)] px-3 py-1.5 text-[12px] text-[var(--dim)] hover:border-[var(--acc)] hover:text-[var(--fg)] disabled:opacity-40"
          >
            {c}
          </button>
        ))}
      </div>

      {/* Chat */}
      <div className="mt-3 flex flex-col border border-[var(--rule2)]">
        <div className="flex max-h-[300px] min-h-[120px] flex-col gap-2.5 overflow-y-auto p-4">
          {messages.length === 0 && !error && (
            <p className="text-[13px] leading-[1.6] text-[var(--faint)]">
              Contame qué querés lograr, o tocá una sugerencia de arriba. Te propongo los cambios y
              los aprobás antes de aplicar.
            </p>
          )}
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role} text={m.content} />
          ))}
          {busy && (
            <div className="font-mono text-[11px] tracking-[0.1em] text-[var(--faint)]">PENSANDO…</div>
          )}
          {error && (
            <div className="font-mono text-[11px] leading-[1.5]" style={{ color: "var(--destructive)" }}>
              {error}
            </div>
          )}
          {pending && <ReviewCard changes={pending} onApprove={approve} onDiscard={discard} />}
        </div>
        <div className="flex items-center gap-2 border-t border-[var(--rule2)] p-2.5">
          <input
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
            placeholder="Hablá con el coach…"
            className="flex-1 bg-transparent px-1 text-[13.5px] text-[var(--fg)] outline-none placeholder:text-[var(--faint2)]"
          />
          <button
            onClick={() => void send()}
            disabled={busy || !input.trim()}
            className="bg-[var(--acc)] px-4 py-2 font-mono text-[11px] font-bold tracking-[0.06em] text-[var(--on)] disabled:opacity-40"
          >
            ENVIAR
          </button>
        </div>
      </div>

      {/* Secondary: provider + Claude Code + day */}
      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <button
          onClick={() => setShowProvider((v) => !v)}
          className="flex items-center gap-1.5 border border-[var(--rule2)] px-3 py-2 font-mono text-[10.5px] font-semibold tracking-[0.06em] text-[var(--dim)] hover:text-[var(--fg)]"
        >
          <ChevronDown
            className="size-3.5 transition-transform"
            style={{ transform: showProvider ? "rotate(180deg)" : "none" }}
          />
          {coach.provider === "local" ? "LOCAL" : "API"} · {coach.model}
        </button>
        <button
          onClick={() => void openCoach()}
          className="border-2 border-[var(--fg)] px-3.5 py-2 font-mono text-[10.5px] font-semibold tracking-[0.06em] text-[var(--fg)]"
        >
          ABRIR EN CLAUDE CODE
        </button>
        <button
          onClick={onStart}
          className="font-mono text-[10.5px] tracking-[0.06em] text-[var(--faint)] hover:text-[var(--fg)]"
        >
          VER MI DÍA →
        </button>
      </div>

      {showProvider && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border border-[var(--rule2)] p-3">
          {(["anthropic", "local"] as const).map((p) => {
            const on = coach.provider === p;
            return (
              <button
                key={p}
                onClick={() => setCoachConfig({ provider: p })}
                className="border px-3 py-1.5 font-mono text-[10.5px] font-semibold tracking-[0.06em]"
                style={{
                  borderColor: on ? "var(--acc)" : "var(--rule2)",
                  background: on ? "var(--acc)" : "transparent",
                  color: on ? "var(--on)" : "var(--dim)",
                }}
              >
                {p === "anthropic" ? "API" : "LOCAL"}
              </button>
            );
          })}
          <input
            value={coach.model}
            onChange={(e) => setCoachConfig({ model: e.currentTarget.value })}
            aria-label="Modelo"
            placeholder="modelo"
            className="w-[180px] border border-[var(--rule2)] bg-transparent px-2.5 py-1.5 font-mono text-[11px] text-[var(--fg)] outline-none focus:border-[var(--acc)] placeholder:text-[var(--faint2)]"
          />
          {coach.provider === "local" && (
            <input
              value={coach.endpoint}
              onChange={(e) => setCoachConfig({ endpoint: e.currentTarget.value })}
              aria-label="Endpoint"
              placeholder="http://localhost:11434/v1"
              className="min-w-[160px] flex-1 border border-[var(--rule2)] bg-transparent px-2.5 py-1.5 font-mono text-[11px] text-[var(--fg)] outline-none focus:border-[var(--acc)] placeholder:text-[var(--faint2)]"
            />
          )}
          <span className="font-mono text-[9.5px] tracking-[0.06em] text-[var(--faint2)]">
            {coach.provider === "local" ? "OLLAMA / LM STUDIO" : "ANTHROPIC_API_KEY EN EL ENTORNO"}
          </span>
        </div>
      )}

      {/* Profile (context) */}
      <button
        onClick={() => setShowProfile((v) => !v)}
        className="mt-6 flex w-full items-center justify-between border-b border-[var(--rule2)] pb-2"
      >
        <span className="font-mono text-[10px] font-semibold tracking-[0.16em] text-[var(--faint)]">
          TU PERFIL{profileFilled ? "" : " · VACÍO"}
        </span>
        <ChevronDown
          className="size-4 text-[var(--faint2)] transition-transform"
          style={{ transform: showProfile ? "rotate(180deg)" : "none" }}
        />
      </button>
      {showProfile && (
        <div className="mt-3 flex flex-col gap-4">
          <Field
            label="OBJETIVOS"
            value={profile.goals}
            onChange={(v) => setProfile({ goals: v })}
            placeholder="Ej: mi primer muscle-up, 12 dominadas seguidas, bajar grasa…"
          />
          <Field
            label="DIETA"
            value={profile.diet}
            onChange={(v) => setProfile({ diet: v })}
            placeholder="Ej: superávit leve, ~140 g de proteína, ayuno hasta el mediodía…"
          />
          <Field
            label="RESTRICCIONES Y NOTAS"
            value={profile.constraints}
            onChange={(v) => setProfile({ constraints: v })}
            placeholder="Ej: molestia en hombro derecho, sin saltos por los vecinos…"
          />
        </div>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  valueColor,
  border,
}: {
  label: string;
  value: string;
  sub: string;
  valueColor?: string;
  border?: boolean;
}) {
  return (
    <div className={`p-4 ${border ? "border-l border-[var(--rule2)]" : ""}`}>
      <div className="font-mono text-[9.5px] font-semibold tracking-[0.12em] text-[var(--faint)]">
        {label}
      </div>
      <div
        className="mt-1.5 truncate text-[22px] leading-none font-bold tracking-[-0.02em]"
        style={{ color: valueColor ?? "var(--fg)" }}
      >
        {value}
      </div>
      <div className="mt-1.5 truncate font-mono text-[9px] tracking-[0.08em] text-[var(--faint2)]">
        {sub}
      </div>
    </div>
  );
}

function Bubble({ role, text }: { role: "user" | "assistant"; text: string }) {
  const mine = role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[85%] px-3 py-2 text-[13px] leading-[1.5] whitespace-pre-wrap"
        style={{
          background: mine ? "var(--acc)" : "var(--bar0)",
          color: mine ? "var(--on)" : "var(--fg)",
        }}
      >
        {text}
      </div>
    </div>
  );
}

function ReviewCard({
  changes,
  onApprove,
  onDiscard,
}: {
  changes: ProposedChange[];
  onApprove: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="border border-[var(--acc)]">
      <div className="border-b border-[var(--rule2)] px-3 py-2 font-mono text-[10px] font-semibold tracking-[0.14em] text-[var(--acc)]">
        CAMBIOS PROPUESTOS · {changes.length}
      </div>
      <div className="flex flex-col gap-1.5 px-3 py-2.5">
        {changes.map((c, i) => (
          <div key={i} className="flex gap-2 text-[12.5px] leading-[1.45] text-[var(--fg)]">
            <span className="text-[var(--acc)]">›</span>
            <span>{humanizeChange(c)}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 border-t border-[var(--rule2)] p-2.5">
        <button
          onClick={onApprove}
          className="flex flex-1 items-center justify-center gap-1 bg-[var(--acc)] py-1.5 font-mono text-[11px] font-bold tracking-[0.06em] text-[var(--on)]"
        >
          <Check className="size-3.5" strokeWidth={3} /> APLICAR
        </button>
        <button
          onClick={onDiscard}
          className="border border-[var(--rule2)] px-3 py-1.5 font-mono text-[11px] font-semibold tracking-[0.06em] text-[var(--dim)] hover:border-[var(--fg)] hover:text-[var(--fg)]"
        >
          DESCARTAR
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] tracking-[0.1em] text-[var(--faint)]">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder={placeholder}
        rows={2}
        className={field}
      />
    </label>
  );
}
