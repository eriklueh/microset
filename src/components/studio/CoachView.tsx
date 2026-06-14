import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { openCoach } from "@/lib/windows";
import { useStore } from "@/store/useStore";
import { applyChanges, humanizeChange, type ProposedChange } from "@/coach/changes";
import { getProvider, type CoachMessage } from "@/coach/provider";
import { coachSnapshot } from "@/coach/snapshot";
import {
  deleteConversation,
  listConversations,
  loadConversation,
  saveConversation,
  type Conversation,
  type ConversationMeta,
} from "@/coach/history";

const WARN = "#e0a400";
const STARTERS = [
  "Armá mi semana para mi objetivo",
  "Subí mi volumen sin pasarme del horario",
  "Tengo una molestia hoy, adaptá la rutina",
];
const nowISO = () => new Date().toISOString();

export function CoachView({ onSettings }: { onSettings: () => void }) {
  const coach = useStore((s) => s.coach);
  const dayTypes = useStore((s) => s.dayTypes);
  const week = useStore((s) => s.week);
  const logs = useStore((s) => s.logs);
  const settings = useStore((s) => s.settings);
  const owned = useStore((s) => s.ownedEquipment);
  const snap = useMemo(() => coachSnapshot(), [dayTypes, week, logs, settings, owned]);

  const [convos, setConvos] = useState<ConversationMeta[]>([]);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ProposedChange[] | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const refresh = () => void listConversations().then(setConvos);
  useEffect(refresh, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [conv?.messages.length, pending, busy]);

  const messages = conv?.messages ?? [];

  const persist = (c: Conversation) => {
    setConv(c);
    void saveConversation(c).then(refresh);
  };

  const send = async (text: string = input) => {
    const t = text.trim();
    if (!t || busy) return;
    setError(null);
    setPending(null);
    const ts = nowISO();
    const base: Conversation =
      conv ?? {
        id: crypto.randomUUID(),
        title: t.slice(0, 48),
        createdAt: ts,
        updatedAt: ts,
        provider: coach.provider,
        messages: [],
        applied: [],
        source: "app",
      };
    const withUser: Conversation = {
      ...base,
      provider: coach.provider,
      updatedAt: ts,
      messages: [...base.messages, { role: "user", content: t, ts }],
    };
    persist(withUser);
    setInput("");
    setBusy(true);
    try {
      const history: CoachMessage[] = withUser.messages.map((m) => ({ role: m.role, content: m.content }));
      const reply = await getProvider().complete(history);
      const at = nowISO();
      persist({
        ...withUser,
        updatedAt: at,
        messages: [...withUser.messages, { role: "assistant", content: reply.text || "(propone cambios)", ts: at }],
      });
      if (reply.changes.length) setPending(reply.changes);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const approve = () => {
    if (!pending || !conv) return;
    const results = applyChanges(pending);
    const ts = nowISO();
    persist({
      ...conv,
      updatedAt: ts,
      applied: [...conv.applied, { ts, changes: pending.map(humanizeChange) }],
      messages: [...conv.messages, { role: "assistant", content: `Aplicado:\n- ${results.join("\n- ")}`, ts }],
    });
    setPending(null);
  };
  const discard = () => {
    if (conv) {
      persist({
        ...conv,
        updatedAt: nowISO(),
        messages: [...conv.messages, { role: "assistant", content: "Cambios descartados.", ts: nowISO() }],
      });
    }
    setPending(null);
  };

  const newChat = () => {
    setConv(null);
    setPending(null);
    setError(null);
    setInput("");
  };
  const openConv = async (id: string) => {
    const c = await loadConversation(id);
    if (c) {
      setConv(c);
      setPending(null);
      setError(null);
    }
  };
  const removeConv = async (id: string, e: MouseEvent) => {
    e.stopPropagation();
    await deleteConversation(id);
    if (conv?.id === id) setConv(null);
    refresh();
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

      {/* Actionable status strip */}
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

      {/* Threads rail + chat */}
      <div className="mt-3.5 flex min-h-0 flex-1 border border-[var(--rule2)]">
        <aside className="flex w-[180px] flex-none flex-col border-r border-[var(--rule2)]">
          <button
            onClick={newChat}
            className="flex items-center gap-1.5 border-b border-[var(--rule2)] px-3 py-2.5 font-mono text-[10.5px] font-semibold tracking-[0.08em] text-[var(--acc)] hover:bg-[var(--bar0)]"
          >
            <Plus className="size-3.5" /> NUEVA
          </button>
          <div className="flex flex-1 flex-col overflow-y-auto">
            {convos.length === 0 && (
              <div className="px-3 py-3 font-mono text-[10px] leading-[1.5] tracking-[0.04em] text-[var(--faint2)]">
                SIN CHARLAS TODAVÍA
              </div>
            )}
            {convos.map((c) => {
              const active = conv?.id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => void openConv(c.id)}
                  className="group flex items-center gap-1 border-b border-[var(--rule)] px-3 py-2.5 text-left"
                  style={{ background: active ? "var(--bar0)" : "transparent" }}
                >
                  <span
                    className="min-w-0 flex-1 truncate text-[12px]"
                    style={{ color: active ? "var(--fg)" : "var(--dim)" }}
                  >
                    {c.title}
                  </span>
                  <Trash2
                    onClick={(e) => void removeConv(c.id, e)}
                    className="size-3.5 flex-none text-[var(--faint2)] opacity-0 group-hover:opacity-100 hover:text-[var(--destructive)]"
                  />
                </button>
              );
            })}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-4">
            {messages.length === 0 && !error ? (
              <div className="m-auto max-w-[420px] text-center">
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
