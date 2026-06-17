import { Fragment, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Check, History, Plus, Trash2, X } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  listCoachSessions,
  openCoach,
  readCoachSession,
  type CoachSession,
  type CoachSessionMsg,
} from "@/lib/windows";
import { useStore } from "@/store/useStore";
import { ViewHeader } from "./shell";
import { Corners, RegMark } from "./hud";
import { applyChanges, humanizeChange, type ProposedChange } from "@/coach/changes";
import { getProvider, type CoachMessage } from "@/coach/provider";
import { coachSnapshot } from "@/coach/snapshot";
import { useT } from "@/lib/i18n";
import {
  deleteConversation,
  listConversations,
  loadConversation,
  saveConversation,
  type Conversation,
  type ConversationMeta,
} from "@/coach/history";

const WARN = "#e0a400";
const nowISO = () => new Date().toISOString();

type Thread = {
  id: string;
  title: string;
  updatedAt: string;
  source: "app" | "claude-code";
  cwd?: string;
};

const MD: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc pl-4 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal pl-4 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="mb-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ children, href }) => (
    <a href={href} className="text-[var(--acc)] underline">
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="bg-[var(--bar1)] px-1 py-0.5 font-mono text-[12px]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto bg-[var(--bar1)] p-2 font-mono text-[12px] leading-[1.4] last:mb-0">
      {children}
    </pre>
  ),
  h1: ({ children }) => <div className="mt-2 mb-1 text-[14px] font-bold first:mt-0">{children}</div>,
  h2: ({ children }) => <div className="mt-2 mb-1 text-[13.5px] font-bold first:mt-0">{children}</div>,
  h3: ({ children }) => <div className="mt-2 mb-1 text-[13px] font-semibold first:mt-0">{children}</div>,
  hr: () => <hr className="my-2 border-[var(--rule2)]" />,
};

function MarkdownText({ text }: { text: string }) {
  return (
    <div className="text-[13px] leading-[1.5]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

export function CoachView({ onSettings }: { onSettings: () => void }) {
  const t = useT();
  const coach = useStore((s) => s.coach);
  const dayTypes = useStore((s) => s.dayTypes);
  const week = useStore((s) => s.week);
  const logs = useStore((s) => s.logs);
  const settings = useStore((s) => s.settings);
  const owned = useStore((s) => s.ownedEquipment);
  const snap = useMemo(() => coachSnapshot(), [dayTypes, week, logs, settings, owned]);

  const [convos, setConvos] = useState<ConversationMeta[]>([]);
  const [ccSessions, setCcSessions] = useState<CoachSession[]>([]);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [ccConv, setCcConv] = useState<{
    id: string;
    cwd: string;
    title: string;
    messages: CoachSessionMsg[];
  } | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ProposedChange[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const refresh = () => void listConversations().then(setConvos);
  useEffect(refresh, []);
  useEffect(() => {
    void listCoachSessions().then(setCcSessions);
  }, []);
  const threads = useMemo<Thread[]>(() => {
    const app: Thread[] = convos.map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
      source: "app",
    }));
    const cc: Thread[] = ccSessions.map((s) => ({
      id: s.id,
      title: s.title,
      updatedAt: s.updatedAt,
      source: "claude-code",
      cwd: s.cwd,
    }));
    return [...app, ...cc].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }, [convos, ccSessions]);
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
    setCcConv(null);
    setPending(null);
    setError(null);
    setInput("");
  };
  const openConv = async (id: string) => {
    setCcConv(null);
    const c = await loadConversation(id);
    if (c) {
      setConv(c);
      setPending(null);
      setError(null);
    }
  };
  const openCC = async (t: Thread) => {
    setConv(null);
    setPending(null);
    setError(null);
    const messages = await readCoachSession(t.id, t.cwd ?? "");
    setCcConv({ id: t.id, cwd: t.cwd ?? "", title: t.title, messages });
  };
  const removeConv = async (id: string, e: MouseEvent) => {
    e.stopPropagation();
    await deleteConversation(id);
    if (conv?.id === id) setConv(null);
    refresh();
  };

  // Diagnostic telemetry segments — the coach's live read of state; warn/ready ones are
  // tappable shortcuts that fire a fix prompt at the coach.
  const segs: { label: string; value: string; tone?: "ok" | "warn"; onClick?: () => void }[] = [
    { label: t.coach.week, value: `${snap.activeDays} ${t.coach.activeDaysUnit}` },
    {
      label: t.coach.feasibility,
      value: snap.feasibilityOk ? t.coach.allFits : `${t.coach.wontFit}: ${snap.overflow.join(", ")}`,
      tone: snap.feasibilityOk ? "ok" : "warn",
      onClick: snap.feasibilityOk ? undefined : () => void send(t.coach.promptFitVolume),
    },
    {
      label: t.coach.progression,
      value: snap.readyToLevel.length
        ? `${t.coach.ready}: ${snap.readyToLevel[0]}`
        : `${snap.thisWeekSets} ${t.coach.setsSevenDays}`,
      tone: snap.readyToLevel.length ? "ok" : undefined,
      onClick: snap.readyToLevel.length
        ? () => void send(`${t.coach.promptLevelUpPrefix} ${snap.readyToLevel[0]}?`)
        : undefined,
    },
    {
      label: t.coach.balanceTitle,
      value: snap.balanceLabel.startsWith("Falta") ? snap.balanceLabel : t.coach.balanced,
      tone: snap.balanceLabel.startsWith("Falta") ? "warn" : "ok",
      onClick: snap.balanceLabel.startsWith("Falta") ? () => void send(t.coach.promptBalance) : undefined,
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <ViewHeader
        kicker={t.coach.subtitle}
        title={t.coach.title}
        right={
          <>
            <button
              onClick={() => {
                newChat();
                setHistoryOpen(false);
              }}
              className="flex items-center gap-1.5 border border-[var(--rule2)] px-2.5 py-1.5 font-mono text-[10px] font-semibold tracking-[0.06em] text-[var(--acc)] hover:bg-[var(--bar0)]"
            >
              <Plus className="size-3" /> {t.coach.new}
            </button>
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              className="flex items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[10px] font-semibold tracking-[0.06em] hover:text-[var(--fg)]"
              style={{
                borderColor: historyOpen ? "var(--acc)" : "var(--rule2)",
                color: historyOpen ? "var(--acc)" : "var(--dim)",
              }}
            >
              <History className="size-3" /> {t.coach.history}
              {threads.length ? ` · ${threads.length}` : ""}
            </button>
            <button
              onClick={onSettings}
              title={`${t.coach.configureInSettings} · ${coach.model}`}
              className="max-w-[180px] truncate border border-[var(--rule2)] px-2.5 py-1.5 font-mono text-[10px] font-semibold tracking-[0.06em] text-[var(--dim)] hover:text-[var(--fg)]"
            >
              {coach.provider === "local" ? "LOCAL" : "API"} · {coach.model.replace(/^claude-/, "")}
            </button>
            <button
              onClick={() => void openCoach()}
              className="border border-[var(--rule2)] px-2.5 py-1.5 font-mono text-[10px] font-semibold tracking-[0.06em] text-[var(--dim)] hover:text-[var(--fg)]"
            >
              CLAUDE CODE
            </button>
          </>
        }
      />

      {/* DIAGNÓSTICO — compact HUD telemetry band (full width, no rail) */}
      <div className="flex flex-none flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--rule2)] px-7 py-2.5">
        <span className="flex flex-none items-center gap-2 font-mono text-[9px] tracking-[0.16em] text-[var(--acc)]">
          <span className="ms-blink inline-block size-1.5 bg-[var(--acc)]" />
          {t.coach.diagnostic}
        </span>
        {segs.map((seg, i) => (
          <Fragment key={i}>
            <span className="h-3 w-px flex-none bg-[var(--rule2)]" />
            <Seg label={seg.label} value={seg.value} tone={seg.tone} onClick={seg.onClick} />
          </Fragment>
        ))}
      </div>

      {/* CHAT — focused console: a centered column on a faint HUD field; history in a drawer */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle, color-mix(in oklch, var(--faint2) 13%, transparent) 1px, transparent 1.5px)",
            backgroundSize: "14px 14px",
          }}
        />
        <Corners />
        <RegMark className="top-3 left-5" />
        <RegMark className="top-3 right-5" />

        <section className="relative z-[1] mx-auto flex min-h-0 w-full max-w-[760px] flex-col border-x border-[var(--rule2)] bg-[var(--bg)]">
          {ccConv ? (
            <>
              <div className="flex flex-none items-center justify-between gap-3 border-b border-[var(--rule2)] px-5 py-3">
                <span className="min-w-0 truncate text-[13px] font-semibold text-[var(--fg)]">
                  {ccConv.title}
                </span>
                <span className="flex-none font-mono text-[9px] font-bold tracking-[0.12em] text-[var(--faint2)]">
                  {t.coach.claudeCodeReadOnly}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-5 py-4">
                {ccConv.messages.length === 0 && (
                  <div className="m-auto font-mono text-[11px] tracking-[0.06em] text-[var(--faint)]">
                    {t.coach.emptyOrUnreadable}
                  </div>
                )}
                {ccConv.messages.map((m, i) => (
                  <Bubble key={i} role={m.role} text={m.text} />
                ))}
              </div>
              <div className="flex flex-none items-center justify-between gap-2 border-t border-[var(--rule2)] px-5 py-3">
                <span className="font-mono text-[9.5px] tracking-[0.06em] text-[var(--faint2)]">
                  {t.coach.conversationLivesInClaudeCode}
                </span>
                <button
                  onClick={() => void openCoach(ccConv.id, ccConv.cwd)}
                  className="border-2 border-[var(--fg)] px-3.5 py-1.5 font-mono text-[10.5px] font-semibold tracking-[0.06em] text-[var(--fg)]"
                >
                  {t.coach.resumeInClaudeCodeBtn}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-5 py-4">
                {messages.length === 0 && !error ? (
                  <div className="m-auto max-w-[440px] text-center">
                    <div className="text-[18px] font-bold tracking-[-0.01em] text-[var(--fg)]">{t.coach.onboardingTitle}</div>
                    <p className="mx-auto mt-2 max-w-[380px] text-[13px] leading-[1.6] text-[var(--faint)]">
                      {t.coach.onboardingBody}
                    </p>
                    <div className="mt-5 flex flex-col gap-2 text-left">
                      {t.coach.starters.map((s) => (
                        <button
                          key={s}
                          onClick={() => void send(s)}
                          className="group flex items-center gap-2.5 border border-[var(--rule2)] px-3.5 py-2.5 text-[12.5px] text-[var(--dim)] hover:border-[var(--acc)] hover:text-[var(--fg)]"
                        >
                          <span className="font-mono text-[var(--faint2)] group-hover:text-[var(--acc)]">›</span>
                          <span>{s}</span>
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
                      <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.1em] text-[var(--faint)]">
                        <span className="ms-blink inline-block size-1.5 bg-[var(--acc)]" />
                        {t.coach.thinking}
                      </div>
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

              <div className="flex flex-none items-center gap-2 border-t border-[var(--rule2)] px-5 py-3">
                <input
                  value={input}
                  onChange={(e) => setInput(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void send();
                  }}
                  placeholder={t.coach.inputPlaceholder}
                  className="flex-1 bg-transparent px-1 text-[13.5px] text-[var(--fg)] outline-none placeholder:text-[var(--faint2)]"
                />
                <button
                  onClick={() => void send()}
                  disabled={busy || !input.trim()}
                  className="bg-[var(--acc)] px-4 py-2 font-mono text-[11px] font-bold tracking-[0.06em] text-[var(--on)] disabled:opacity-40"
                >
                  {t.coach.send}
                </button>
              </div>
            </>
          )}
        </section>

        {/* HISTORIAL — conversations drawer; overlays the chat so it never steals chat width */}
        {historyOpen && (
          <>
            <button
              aria-label="cerrar"
              onClick={() => setHistoryOpen(false)}
              className="absolute inset-0 z-10"
              style={{ background: "color-mix(in oklch, var(--bg) 55%, transparent)" }}
            />
            <aside className="absolute inset-y-0 left-0 z-20 flex w-[300px] flex-col border-r border-[var(--rule2)] bg-[var(--bg)]">
              <div className="flex flex-none items-center justify-between border-b border-[var(--rule2)] px-5 py-3">
                <span className="font-mono text-[9.5px] tracking-[0.16em] text-[var(--acc)]">
                  {t.coach.conversations}
                </span>
                <button
                  onClick={() => setHistoryOpen(false)}
                  aria-label="cerrar"
                  className="text-[var(--faint2)] hover:text-[var(--fg)]"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                {threads.length === 0 && (
                  <div className="px-5 py-3 font-mono text-[10px] leading-[1.5] tracking-[0.04em] text-[var(--faint2)]">
                    {t.coach.noChatsYet}
                  </div>
                )}
                {threads.map((c) => {
                  const isCC = c.source === "claude-code";
                  const active = isCC ? ccConv?.id === c.id : conv?.id === c.id;
                  return (
                    <button
                      key={`${c.source}-${c.id}`}
                      onClick={() => {
                        if (isCC) void openCC(c);
                        else void openConv(c.id);
                        setHistoryOpen(false);
                      }}
                      title={isCC ? t.coach.resumeInClaudeCode : undefined}
                      className="group relative flex items-center gap-1.5 border-b border-[var(--rule)] px-5 py-2.5 text-left"
                      style={{ background: active ? "var(--bar0)" : "transparent" }}
                    >
                      {active && <span className="absolute inset-y-0 left-0 w-[3px] bg-[var(--acc)]" />}
                      <span
                        className="min-w-0 flex-1 truncate text-[12px]"
                        style={{ color: active ? "var(--fg)" : "var(--dim)" }}
                      >
                        {c.title}
                      </span>
                      {isCC ? (
                        <span className="flex-none font-mono text-[8px] font-bold tracking-[0.12em] text-[var(--faint2)]">
                          CC
                        </span>
                      ) : (
                        <Trash2
                          onClick={(e) => void removeConv(c.id, e)}
                          className="size-3.5 flex-none text-[var(--faint2)] opacity-0 group-hover:opacity-100 hover:text-[var(--destructive)]"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}

/** One segment of the diagnostic telemetry band. Actionable (warn/ready) segments are tappable
 *  shortcuts that fire a fix prompt at the coach (shown with a › affordance). */
function Seg({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
  onClick?: () => void;
}) {
  const color = tone === "warn" ? WARN : tone === "ok" ? "var(--acc)" : "var(--fg)";
  const inner = (
    <>
      <span className="font-mono text-[9px] tracking-[0.12em] text-[var(--faint2)]">{label}</span>
      <span className="font-mono text-[10.5px] tracking-[0.02em]" style={{ color }}>
        {value}
      </span>
      {onClick && (
        <span className="font-mono text-[11px] leading-none text-[var(--acc)]" aria-hidden>
          ›
        </span>
      )}
    </>
  );
  const cls = "flex flex-none items-center gap-1.5";
  return onClick ? (
    <button onClick={onClick} className={`${cls} hover:opacity-70`}>
      {inner}
    </button>
  ) : (
    <span className={cls}>{inner}</span>
  );
}

function Bubble({ role, text }: { role: "user" | "assistant"; text: string }) {
  const mine = role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[85%] px-3 py-2 text-[13px] leading-[1.5]"
        style={{
          background: mine ? "var(--acc)" : "var(--bar0)",
          color: mine ? "var(--on)" : "var(--fg)",
        }}
      >
        {mine ? <div className="whitespace-pre-wrap">{text}</div> : <MarkdownText text={text} />}
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
  const t = useT();
  return (
    <div className="border border-[var(--acc)]">
      <div className="border-b border-[var(--rule2)] px-3 py-2 font-mono text-[10px] font-semibold tracking-[0.14em] text-[var(--acc)]">
        {t.coach.proposedChanges} · {changes.length}
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
          <Check className="size-3.5" strokeWidth={3} /> {t.coach.apply}
        </button>
        <button
          onClick={onDiscard}
          className="border border-[var(--rule2)] px-3 py-1.5 font-mono text-[11px] font-semibold tracking-[0.06em] text-[var(--dim)] hover:border-[var(--fg)] hover:text-[var(--fg)]"
        >
          {t.coach.discard}
        </button>
      </div>
    </div>
  );
}
