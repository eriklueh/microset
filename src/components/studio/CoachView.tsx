import { useState } from "react";
import { Check } from "lucide-react";
import { Masthead } from "./Masthead";
import { openCoach } from "@/lib/windows";
import { useStore } from "@/store/useStore";
import { applyChanges, describeChange, type ProposedChange } from "@/coach/changes";
import { getProvider, type CoachMessage } from "@/coach/provider";

const field =
  "w-full resize-none border border-[var(--rule2)] bg-transparent px-3 py-2.5 text-[13.5px] leading-[1.5] text-[var(--fg)] outline-none focus:border-[var(--acc)] placeholder:text-[var(--faint2)]";

export function CoachView({ onStart }: { onStart: () => void }) {
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);

  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ProposedChange[] | null>(null);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setPending(null);
    const next = [...messages, { role: "user" as const, content: text }];
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
    <div className="flex flex-col px-[34px] py-[30px]">
      <Masthead title="COACH" sub="AGENTE IA · SONNET" />

      <div className="flex flex-col border border-[var(--rule2)]">
        <div className="flex max-h-[340px] min-h-[150px] flex-col gap-2.5 overflow-y-auto p-4">
          {messages.length === 0 && !error && (
            <p className="text-[13px] leading-[1.6] text-[var(--faint)]">
              Pedile que arme o ajuste tu rutina, semana o equipo — te propone los cambios y los
              aprobás antes de aplicar. Ej: “armá mi semana para mi primer muscle-up sin pasarme del
              horario”.
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

      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <button
          onClick={() => void openCoach()}
          className="border-2 border-[var(--fg)] px-[18px] py-2.5 font-mono text-[11px] font-semibold tracking-[0.06em] text-[var(--fg)]"
        >
          ABRIR EN CLAUDE CODE
        </button>
        <button
          onClick={onStart}
          className="border border-[var(--rule2)] px-[18px] py-2.5 font-mono text-[11px] font-semibold tracking-[0.06em] text-[var(--dim)] hover:border-[var(--fg)] hover:text-[var(--fg)]"
        >
          VER MI DÍA
        </button>
        <span className="font-mono text-[10px] tracking-[0.06em] text-[var(--faint2)]">
          REQUIERE ANTHROPIC_API_KEY · O USÁ CLAUDE CODE (CAMBIOS EN VIVO)
        </span>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <span className="font-mono text-[10px] font-semibold tracking-[0.16em] text-[var(--faint)]">
          TU PERFIL
        </span>
        <span className="font-mono text-[9.5px] tracking-[0.1em] text-[var(--faint2)]">SE GUARDA SOLO</span>
      </div>
      <p className="mt-2 text-[12.5px] leading-[1.5] text-[var(--faint)]">
        El coach usa esto como punto de partida.
      </p>

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
      <div className="flex flex-col gap-1 px-3 py-2.5">
        {changes.map((c, i) => (
          <div key={i} className="font-mono text-[11px] leading-[1.5] text-[var(--dim)]">
            {describeChange(c)}
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
