import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { openCoach } from "@/lib/windows";
import { useStore } from "@/store/useStore";
import { applyChanges, humanizeChange, type ProposedChange } from "@/coach/changes";
import { getProvider, type CoachMessage } from "@/coach/provider";
import { coachSnapshot } from "@/coach/snapshot";

const WARN = "#e0a400";
const STARTERS = [
  "Armá mi semana para mi objetivo",
  "Subí mi volumen sin pasarme del horario",
  "Tengo una molestia hoy, adaptá la rutina",
];

/**
 * Coach = a full-height chat with a compact, actionable status strip on top.
 * Provider/model config and the profile live in Ajustes (they're settings); this
 * view stays focused on the conversation. The strip's warnings double as prompts.
 */
export function CoachView({ onSettings }: { onSettings: () => void }) {
  const coach = useStore((s) => s.coach);
  const dayTypes = useStore((s) => s.dayTypes);
  const week = useStore((s) => s.week);
  const logs = useStore((s) => s.logs);
  const settings = useStore((s) => s.settings);
  const owned = useStore((s) => s.ownedEquipment);
  const snap = useMemo(() => coachSnapshot(), [dayTypes, week, logs, settings, owned]);

  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ProposedChange[] | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pending, busy]);

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

  return (
    <div className="flex h-full flex-col px-[34px] pt-[22px] pb-[18px]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[30px] leading-none font-extrabold tracking-[-0.03em] text-[var(--fg)]">
            COACH
          </h2>
          <div className="mt-1.5 font-mono text-[10px] tracking-[0.12em] text-[var(--faint)]">
            TU ENTRENADOR
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onSettings}
            title="Configurar en Ajustes"
            className="border border-[var(--rule2)] px-2.5 py-1.5 font-mono text-[10px] font-semibold tracking-[0.06em] text-[var(--dim)] hover:text-[var(--fg)]"
          >
            {coach.provider === "local" ? "LOCAL" : "API"} · {coach.model}
          </button>
          <button
            onClick={() => void openCoach()}
            className="border border-[var(--rule2)] px-2.5 py-1.5 font-mono text-[10px] font-semibold tracking-[0.06em] text-[var(--dim)] hover:text-[var(--fg)]"
          >
            CLAUDE CODE
          </button>
        </div>
      </div>

      {/* Actionable status strip (warnings double as prompts) */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <Insight label={`SEMANA · ${snap.activeDays}`} />
        {snap.feasibilityOk ? (
          <Insight label="TODO ENTRA" tone="ok" />
        ) : (
          <Insight
            label={`NO ENTRA: ${snap.overflow.join(", ")}`}
            tone="warn"
            onClick={() => void send("No me entra el volumen, ajustalo para que entre en mi horario")}
          />
        )}
        {snap.readyToLevel.length > 0 ? (
          <Insight
            label={`LISTO: ${snap.readyToLevel[0]}`}
            tone="ok"
            onClick={() => void send(`¿Estoy listo para subir de nivel en ${snap.readyToLevel[0]}?`)}
          />
        ) : (
          <Insight label={`${snap.thisWeekSets} SERIES · 7D`} />
        )}
        {snap.balanceLabel.startsWith("Falta") ? (
          <Insight
            label={snap.balanceLabel}
            tone="warn"
            onClick={() => void send("Equilibrá los grupos musculares de mi rutina")}
          />
        ) : (
          <Insight label="EQUILIBRADO" />
        )}
      </div>

      {/* Chat fills the rest; only the message list scrolls */}
      <div className="mt-3.5 flex min-h-0 flex-1 flex-col border border-[var(--rule2)]">
        <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-4">
          {messages.length === 0 && !error ? (
            <div className="m-auto max-w-[440px] text-center">
              <div className="text-[16px] font-semibold text-[var(--fg)]">¿Qué querés lograr?</div>
              <p className="mt-2 text-[13px] leading-[1.6] text-[var(--faint)]">
                Te propongo cambios en tu rutina, semana o equipo — y los aprobás antes de aplicar.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    className="border border-[var(--rule2)] px-3 py-2 text-[12.5px] text-[var(--dim)] hover:border-[var(--acc)] hover:text-[var(--fg)]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
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
            </>
          )}
          <div ref={endRef} />
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
    </div>
  );
}

function Insight({ label, tone, onClick }: { label: string; tone?: "ok" | "warn"; onClick?: () => void }) {
  const color = tone === "warn" ? WARN : tone === "ok" ? "var(--acc)" : "var(--faint)";
  const cls =
    "max-w-full truncate border px-2.5 py-1.5 font-mono text-[10.5px] font-semibold tracking-[0.06em] uppercase";
  const style = { borderColor: tone ? color : "var(--rule2)", color };
  return onClick ? (
    <button onClick={onClick} className={`${cls} hover:bg-[var(--bar0)]`} style={style}>
      {label}
    </button>
  ) : (
    <span className={cls} style={style}>
      {label}
    </span>
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
