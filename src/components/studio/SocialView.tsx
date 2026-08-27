import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { SignedIn, SignedOut, SignIn, useUser } from "@clerk/clerk-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useT } from "@/lib/i18n";
import { currentSeasonId, parseSharedRoutine, serializeDayType } from "@/lib/social";
import { useMyStandings } from "@/hooks/useMyStandings";
import { useStore } from "@/store/useStore";
import { ViewHeader } from "./shell";

/** True only when both cloud envs are present at build time. When false the app still runs
 *  fully local — this view just explains that the cloud layer isn't configured, and NO
 *  Clerk/Convex hook is ever mounted (their providers only exist when both envs are set). */
const CLOUD_READY =
  !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY && !!import.meta.env.VITE_CONVEX_URL;

/**
 * AMIGOS — the social/league surface (F4, ver docs/VISION.md §6). Mounted only when the
 * `social` module is enabled (see App/Sidebar), so with the module off this file is never
 * rendered. When the cloud envs are missing it degrades to a note (local-first intact).
 */
export function SocialView() {
  const t = useT();
  return (
    <div className="flex h-full flex-col">
      <ViewHeader kicker={t.social.sub} title={t.social.title} />
      <section className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
        {CLOUD_READY ? (
          <League />
        ) : (
          <div className="border border-[var(--rule2)] p-4 font-mono text-[12px] leading-[1.5] text-[var(--faint)]">
            {t.social.noCloud}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * The signed-in/out league body. Only ever rendered under CLOUD_READY, so the Clerk +
 * Convex providers are guaranteed to be in the tree above it (see main.tsx).
 */
function League() {
  const t = useT();
  return (
    <>
      <SignedOut>
        <div className="mx-auto flex max-w-md flex-col gap-5">
          <div>
            <h2 className="m-0 text-[20px] font-extrabold tracking-[-0.02em] text-[var(--fg)] uppercase">
              {t.social.signInHeading}
            </h2>
            <p className="mt-2 font-mono text-[11px] leading-[1.6] text-[var(--faint)]">
              {t.social.signInSub}
            </p>
          </div>
          <SignIn />
        </div>
      </SignedOut>
      <SignedIn>
        <LeagueSignedIn />
      </SignedIn>
    </>
  );
}

const inputClass =
  "min-w-0 flex-1 border border-[var(--rule2)] bg-transparent px-3 py-2 font-mono text-[12px] text-[var(--fg)] outline-none placeholder:text-[var(--faint2)] focus:border-[var(--acc)]";
const btnClass =
  "flex-none border border-[var(--acc)] px-3 py-2 font-mono text-[11px] font-semibold tracking-[0.06em] text-[var(--fg)] hover:bg-[var(--acc)] hover:text-[var(--on)] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--fg)]";

function LeagueSignedIn() {
  const t = useT();
  const season = currentSeasonId();

  const groups = useQuery(api.social.listMyGroups);
  const createGroup = useMutation(api.social.createGroup);
  const joinGroup = useMutation(api.social.joinGroup);
  const leaveGroup = useMutation(api.social.leaveGroup);
  const upsertMyStandings = useMutation(api.social.upsertMyStandings);

  const [selectedId, setSelectedId] = useState<Id<"groups"> | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [publishState, setPublishState] = useState<"idle" | "busy" | "done">("idle");

  // My publishable row — the single projection shared by auto-publish + the manual button.
  const myStats = useMyStandings();

  // A stable signature of exactly what upsertMyStandings would write, so auto-publish only
  // fires when a value actually changed (never on every render → no mutation spam).
  const statsSig = JSON.stringify([
    season,
    myStats.handle,
    myStats.formaElo,
    myStats.streak,
    myStats.level,
    myStats.weeklyEffort,
    myStats.adherence,
  ]);

  const standings = useQuery(
    api.social.listGroupStandings,
    selectedId ? { groupId: selectedId, seasonId: season } : "skip",
  );
  const selectedGroup = groups?.find((g) => g.id === selectedId) ?? null;

  const publishRow = (groupId: Id<"groups">) =>
    upsertMyStandings({
      groupId,
      seasonId: season,
      handle: myStats.handle,
      formaElo: myStats.formaElo,
      streak: myStats.streak,
      level: myStats.level,
      weeklyEffort: myStats.weeklyEffort,
      adherence: myStats.adherence,
    });

  // AUTO-PUBLISH: this view only ever mounts when signed-in AND the social module is ON, so
  // being rendered is the gate. Push my row to ALL my groups on mount and whenever my stats
  // change. Deduped per group via `publishedRef` so re-renders / unrelated state changes never
  // re-send an identical row.
  const publishedRef = useRef<Record<string, string>>({});
  useEffect(() => {
    if (!groups) return;
    for (const g of groups) {
      if (publishedRef.current[g.id] === statsSig) continue;
      publishedRef.current[g.id] = statsSig;
      publishRow(g.id).catch(() => {
        // let the next change retry this group
        if (publishedRef.current[g.id] === statsSig) delete publishedRef.current[g.id];
      });
    }
    // publishRow closes over the current stats; statsSig captures every value it would send.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, statsSig]);

  // Fresh stats → reset the manual button so it stops reading "published".
  useEffect(() => setPublishState("idle"), [statsSig]);

  const onCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const res = await createGroup({ name: trimmed, seasonId: season });
    setName("");
    setSelectedId(res.groupId);
  };

  const onJoin = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    const res = await joinGroup({ inviteCode: trimmed });
    setCode("");
    setSelectedId(res.groupId);
  };

  const onLeave = async (groupId: Id<"groups">) => {
    await leaveGroup({ groupId });
    delete publishedRef.current[groupId];
    if (selectedId === groupId) setSelectedId(null);
  };

  // Manual fallback — force-publish my row to every group right now.
  const onRefresh = async () => {
    if (!groups || groups.length === 0) return;
    setPublishState("busy");
    try {
      await Promise.all(groups.map((g) => publishRow(g.id)));
      for (const g of groups) publishedRef.current[g.id] = statsSig;
      setPublishState("done");
    } catch {
      setPublishState("idle");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="font-mono text-[10px] tracking-[0.14em] text-[var(--faint2)]">
        {t.social.season} · {season}
      </div>

      {/* MIS GRUPOS */}
      <section className="flex flex-col gap-2">
        <SectionLabel>{t.social.myGroups}</SectionLabel>
        {groups === undefined ? (
          <div className="font-mono text-[11px] text-[var(--faint)]">{t.social.loading}</div>
        ) : groups.length === 0 ? (
          <div className="border border-[var(--rule2)] p-4 font-mono text-[11px] leading-[1.5] text-[var(--faint)]">
            {t.social.noGroups}
          </div>
        ) : (
          <div className="flex flex-col">
            {groups.map((g) => {
              const active = g.id === selectedId;
              return (
                <button
                  key={g.id}
                  onClick={() => setSelectedId(g.id)}
                  className="flex items-center justify-between gap-3 border border-[var(--rule2)] px-4 py-3 text-left [&+&]:border-t-0"
                  style={{
                    background: active ? "var(--acc)" : "transparent",
                    color: active ? "var(--on)" : "var(--fg)",
                  }}
                >
                  <span className="truncate text-[15px] font-bold tracking-[-0.01em] uppercase">
                    {g.name}
                  </span>
                  <span
                    className="flex-none font-mono text-[11px] tracking-[0.12em]"
                    style={{ color: active ? "var(--on)" : "var(--faint)" }}
                  >
                    {t.social.inviteCode} {g.inviteCode}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* CREAR / UNIRSE */}
      <div className="grid gap-6 sm:grid-cols-2">
        <section className="flex flex-col gap-2">
          <SectionLabel>{t.social.createGroup}</SectionLabel>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onCreate()}
              placeholder={t.social.groupNamePlaceholder}
              className={inputClass}
            />
            <button onClick={onCreate} disabled={!name.trim()} className={btnClass}>
              {t.social.create}
            </button>
          </div>
        </section>
        <section className="flex flex-col gap-2">
          <SectionLabel>{t.social.joinGroup}</SectionLabel>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onJoin()}
              placeholder={t.social.codePlaceholder}
              className={`${inputClass} uppercase tracking-[0.14em]`}
            />
            <button onClick={onJoin} disabled={!code.trim()} className={btnClass}>
              {t.social.join}
            </button>
          </div>
        </section>
      </div>

      {/* TABLA DE LA LIGA */}
      <section className="flex flex-col gap-2">
        <SectionLabel>{selectedGroup ? selectedGroup.name : t.social.title}</SectionLabel>
        {!selectedId ? (
          <div className="border border-[var(--rule2)] p-4 font-mono text-[11px] text-[var(--faint)]">
            {t.social.selectGroupHint}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] tracking-[0.12em] text-[var(--faint2)]">
                {t.social.autoPublish}
              </span>
              <button
                onClick={onRefresh}
                disabled={publishState === "busy"}
                className="border border-[var(--rule2)] px-3 py-1.5 font-mono text-[10px] font-semibold tracking-[0.08em] text-[var(--faint)] hover:border-[var(--acc)] hover:text-[var(--fg)] disabled:opacity-50"
              >
                {publishState === "busy"
                  ? t.social.publishing
                  : publishState === "done"
                    ? t.social.published
                    : t.social.refresh}
              </button>
              <button
                onClick={() => onLeave(selectedId)}
                className="ml-auto border border-[var(--rule2)] px-4 py-2 font-mono text-[11px] tracking-[0.06em] text-[var(--faint)] hover:border-[var(--fg)] hover:text-[var(--fg)]"
              >
                {t.social.leave}
              </button>
            </div>
            <StandingsTable standings={standings} />
          </>
        )}
      </section>

      {/* RETO DEL GRUPO — objetivo + check-ins por atleta */}
      {selectedId && (
        <GroupChallenge groupId={selectedId} handle={myStats.handle} standings={standings} />
      )}

      {/* RUTINAS DEL GRUPO — ver / copiar / compartir */}
      {selectedId && <GroupRoutines groupId={selectedId} handle={myStats.handle} />}
    </div>
  );
}

/**
 * The routine-sharing panel for the selected group: a list of routines friends have shared
 * (each copyable into your own library) plus a control to share one of yours. Only stats-free
 * routine templates travel — never logs. The payload is validated on copy (parseSharedRoutine).
 */
function GroupRoutines({ groupId, handle }: { groupId: Id<"groups">; handle: string }) {
  const t = useT();
  const routines = useQuery(api.social.listGroupRoutines, { groupId });
  const shareRoutine = useMutation(api.social.shareRoutine);
  const unshareRoutine = useMutation(api.social.unshareRoutine);
  const dayTypes = useStore((s) => s.dayTypes);
  const importDayType = useStore((s) => s.importDayType);

  const [chosen, setChosen] = useState("");
  const [feedback, setFeedback] = useState<{ id: string; kind: "copied" | "bad" } | null>(null);

  const onShare = async () => {
    const dt = dayTypes.find((d) => d.id === chosen);
    if (!dt) return;
    await shareRoutine({ groupId, name: dt.name, payload: serializeDayType(dt), handle });
    setChosen("");
  };

  const onCopy = (id: string, payload: string) => {
    const parsed = parseSharedRoutine(payload);
    if (!parsed) {
      setFeedback({ id, kind: "bad" });
      return;
    }
    importDayType(parsed);
    setFeedback({ id, kind: "copied" });
  };

  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>{t.social.routines}</SectionLabel>

      {routines === undefined ? (
        <div className="font-mono text-[11px] text-[var(--faint)]">{t.social.loading}</div>
      ) : routines.length === 0 ? (
        <div className="border border-[var(--rule2)] p-4 font-mono text-[11px] leading-[1.5] text-[var(--faint)]">
          {t.social.noRoutines}
        </div>
      ) : (
        <div className="flex flex-col">
          {routines.map((r) => {
            const count = parseSharedRoutine(r.payload)?.routine.length ?? 0;
            const fb = feedback?.id === r.id ? feedback.kind : null;
            return (
              <div
                key={r.id}
                className="flex items-center gap-3 border border-[var(--rule2)] px-4 py-3 [&+&]:border-t-0"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[14px] font-bold tracking-[-0.01em] text-[var(--fg)] uppercase">
                    {r.name}
                  </span>
                  <span className="font-mono text-[10px] tracking-[0.08em] text-[var(--faint)]">
                    {r.mine ? t.social.mineTag : `${t.social.sharedBy} ${r.ownerHandle}`} · {count}{" "}
                    {t.social.routineSets}
                  </span>
                </div>
                {fb === "bad" && (
                  <span className="flex-none font-mono text-[10px] text-[var(--faint)]">
                    {t.social.badRoutine}
                  </span>
                )}
                <button
                  onClick={() => onCopy(r.id, r.payload)}
                  className="flex-none border border-[var(--acc)] px-3 py-1.5 font-mono text-[10px] font-semibold tracking-[0.06em] text-[var(--fg)] hover:bg-[var(--acc)] hover:text-[var(--on)]"
                >
                  {fb === "copied" ? t.social.copied : t.social.copy}
                </button>
                {r.mine && (
                  <button
                    onClick={() => unshareRoutine({ id: r.id })}
                    className="flex-none border border-[var(--rule2)] px-3 py-1.5 font-mono text-[10px] tracking-[0.06em] text-[var(--faint)] hover:border-[var(--fg)] hover:text-[var(--fg)]"
                  >
                    {t.social.unshare}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* COMPARTIR UNA RUTINA */}
      <div className="mt-1 flex gap-2">
        <select
          value={chosen}
          onChange={(e) => setChosen(e.target.value)}
          className={`${inputClass} cursor-pointer`}
        >
          <option value="">{t.social.chooseRoutine}</option>
          {dayTypes.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <button onClick={onShare} disabled={!chosen} className={btnClass}>
          {t.social.share}
        </button>
      </div>
    </section>
  );
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Días (enteros, local) desde hoy hasta `targetDate` (YYYY-MM-DD). Negativo si ya pasó. */
function daysUntil(targetDate: string): number {
  const [y, m, d] = targetDate.split("-").map(Number);
  if (!y || !m || !d) return 0;
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Fracción de progreso 0..1 del último check-in. Con métrica numérica completa:
 * (actual-inicio)/(objetivo-inicio) — funciona subiendo (6→12) o bajando (82→75). Si no,
 * usa el % auto-reportado. Sin datos usables → 0.
 */
function progressFrac(entry: {
  metric: { start: number | null; target: number | null } | null;
  latest: { currentValue: number | null; progressPct: number | null } | null;
}): number {
  const m = entry.metric;
  const l = entry.latest;
  if (
    m &&
    m.start !== null &&
    m.target !== null &&
    m.target !== m.start &&
    l &&
    l.currentValue !== null
  ) {
    return clamp01((l.currentValue - m.start) / (m.target - m.start));
  }
  if (l && l.progressPct !== null) return clamp01(l.progressPct / 100);
  return 0;
}

/**
 * RETO del grupo (F4). Un reto por grupo con título + fecha objetivo; cada miembro fija su
 * objetivo (descripción + métrica opcional) y loguea check-ins. La vista combina las entries
 * del reto con la tabla de la liga (`standings`) para mostrar esfuerzo-semanal + racha por
 * atleta. Cualquier miembro puede crear el reto; sólo el creador puede borrarlo; cada quien
 * escribe SOLO su objetivo/avance (el backend fuerza el userId desde el token).
 */
function GroupChallenge({
  groupId,
  handle,
  standings,
}: {
  groupId: Id<"groups">;
  handle: string;
  standings: StandingRow[] | undefined;
}) {
  const t = useT();
  const { user } = useUser();
  const data = useQuery(api.challenges.getGroupChallenge, { groupId });
  const createChallenge = useMutation(api.challenges.createChallenge);
  const deleteChallenge = useMutation(api.challenges.deleteChallenge);
  const setMyGoal = useMutation(api.challenges.setMyGoal);
  const addCheckin = useMutation(api.challenges.addCheckin);

  // Crear reto
  const [title, setTitle] = useState("");
  const [targetDate, setTargetDate] = useState("");

  // Mi objetivo (se siembra una vez por reto desde mi entry actual)
  const [desc, setDesc] = useState("");
  const [mLabel, setMLabel] = useState("");
  const [mUnit, setMUnit] = useState("");
  const [mStart, setMStart] = useState("");
  const [mTarget, setMTarget] = useState("");
  const [goalSaved, setGoalSaved] = useState(false);

  // Registrar avance
  const [cVal, setCVal] = useState("");
  const [cPct, setCPct] = useState("");
  const [cNote, setCNote] = useState("");

  const challengeId = data?.challenge.id ?? null;
  const myEntry = data?.entries.find((e) => e.isMe) ?? null;

  // Sembrar el form de MI objetivo una sola vez por reto (no pisar ediciones en curso).
  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (!challengeId) {
      seededRef.current = null;
      return;
    }
    if (seededRef.current === challengeId) return;
    seededRef.current = challengeId;
    setDesc(myEntry?.description ?? "");
    setMLabel(myEntry?.metric?.label ?? "");
    setMUnit(myEntry?.metric?.unit ?? "");
    setMStart(myEntry?.metric?.start != null ? String(myEntry.metric.start) : "");
    setMTarget(myEntry?.metric?.target != null ? String(myEntry.metric.target) : "");
  }, [challengeId, myEntry]);

  const onCreate = async () => {
    if (!title.trim() || !targetDate) return;
    await createChallenge({ groupId, title: title.trim(), targetDate });
    setTitle("");
    setTargetDate("");
  };

  const onDelete = async () => {
    if (!challengeId) return;
    await deleteChallenge({ challengeId });
  };

  const onSaveGoal = async () => {
    if (!challengeId || !desc.trim()) return;
    const label = mLabel.trim();
    const start = Number(mStart);
    const target = Number(mTarget);
    await setMyGoal({
      challengeId,
      handle,
      description: desc.trim(),
      ...(label
        ? {
            metricLabel: label,
            ...(mUnit.trim() ? { metricUnit: mUnit.trim() } : {}),
            ...(mStart.trim() !== "" && Number.isFinite(start) ? { metricStart: start } : {}),
            ...(mTarget.trim() !== "" && Number.isFinite(target) ? { metricTarget: target } : {}),
          }
        : {}),
    });
    setGoalSaved(true);
    setTimeout(() => setGoalSaved(false), 1500);
  };

  const onCheckin = async () => {
    if (!challengeId) return;
    const val = Number(cVal);
    const pct = Number(cPct);
    const note = cNote.trim();
    const hasVal = cVal.trim() !== "" && Number.isFinite(val);
    const hasPct = cPct.trim() !== "" && Number.isFinite(pct);
    if (!hasVal && !hasPct && !note) return;
    await addCheckin({
      challengeId,
      ...(hasVal ? { currentValue: val } : {}),
      ...(hasPct ? { progressPct: pct } : {}),
      ...(note ? { note } : {}),
    });
    setCVal("");
    setCPct("");
    setCNote("");
  };

  // Mapa userId → fila de la liga (esfuerzo-semanal / racha), para no duplicar ese cálculo.
  const standingById = new Map((standings ?? []).map((s) => [s.userId, s]));

  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>{t.challenge.label}</SectionLabel>

      {data === undefined ? (
        <div className="font-mono text-[11px] text-[var(--faint)]">{t.social.loading}</div>
      ) : data === null ? (
        /* SIN RETO — cualquier miembro puede crear uno */
        <div className="flex flex-col gap-2 border border-[var(--rule2)] p-4">
          <p className="font-mono text-[11px] leading-[1.5] text-[var(--faint)]">
            {t.challenge.none}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t.challenge.titlePlaceholder}
              className={inputClass}
            />
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              aria-label={t.challenge.targetDateLabel}
              className={`${inputClass} sm:max-w-[11rem]`}
            />
            <button
              onClick={onCreate}
              disabled={!title.trim() || !targetDate}
              className={btnClass}
            >
              {t.challenge.create}
            </button>
          </div>
        </div>
      ) : (
        <ChallengeBody
          data={data}
          standingById={standingById}
          isCreator={!!user && user.id === data.challenge.createdBy}
          onDelete={onDelete}
          goal={{
            desc,
            setDesc,
            mLabel,
            setMLabel,
            mUnit,
            setMUnit,
            mStart,
            setMStart,
            mTarget,
            setMTarget,
            onSaveGoal,
            goalSaved,
          }}
          checkin={{ cVal, setCVal, cPct, setCPct, cNote, setCNote, onCheckin }}
        />
      )}
    </section>
  );
}

type ChallengeData = NonNullable<
  FunctionReturnType<typeof api.challenges.getGroupChallenge>
>;
type ChallengeEntry = ChallengeData["entries"][number];

/** El cuerpo del reto activo: título + cuenta regresiva, lista por atleta, y mi bloque. */
function ChallengeBody({
  data,
  standingById,
  isCreator,
  onDelete,
  goal,
  checkin,
}: {
  data: ChallengeData;
  standingById: Map<string, StandingRow>;
  isCreator: boolean;
  onDelete: () => void;
  goal: {
    desc: string;
    setDesc: (v: string) => void;
    mLabel: string;
    setMLabel: (v: string) => void;
    mUnit: string;
    setMUnit: (v: string) => void;
    mStart: string;
    setMStart: (v: string) => void;
    mTarget: string;
    setMTarget: (v: string) => void;
    onSaveGoal: () => void;
    goalSaved: boolean;
  };
  checkin: {
    cVal: string;
    setCVal: (v: string) => void;
    cPct: string;
    setCPct: (v: string) => void;
    cNote: string;
    setCNote: (v: string) => void;
    onCheckin: () => void;
  };
}) {
  const t = useT();
  const days = daysUntil(data.challenge.targetDate);
  const countdown =
    days < 0
      ? t.challenge.finished
      : days === 0
        ? t.challenge.lastDay
        : days === 1
          ? `1 ${t.challenge.dayLeft}`
          : `${days} ${t.challenge.daysLeft}`;

  // Ordená por progreso desc (las entries no vienen ordenadas del backend).
  const entries = [...data.entries].sort((a, b) => progressFrac(b) - progressFrac(a));

  return (
    <div className="flex flex-col gap-3">
      {/* CABECERA — título + cuenta regresiva + eliminar */}
      <div className="flex flex-wrap items-baseline justify-between gap-3 border border-[var(--rule2)] px-4 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[18px] font-bold tracking-[-0.01em] text-[var(--fg)] uppercase">
            {data.challenge.title}
          </span>
          <span className="font-mono text-[10px] tracking-[0.12em] text-[var(--faint)]">
            {data.challenge.targetDate}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-[11px] font-semibold tracking-[0.1em]"
            style={{ color: days < 0 ? "var(--faint2)" : "var(--acc)" }}
          >
            {countdown}
          </span>
          {isCreator && (
            <button
              onClick={onDelete}
              className="border border-[var(--rule2)] px-3 py-1.5 font-mono text-[10px] tracking-[0.06em] text-[var(--faint)] hover:border-[var(--fg)] hover:text-[var(--fg)]"
            >
              {t.challenge.delete}
            </button>
          )}
        </div>
      </div>

      {/* LISTA POR ATLETA */}
      {entries.length === 0 ? (
        <div className="border border-[var(--rule2)] p-4 font-mono text-[11px] leading-[1.5] text-[var(--faint)]">
          {t.challenge.noEntries}
        </div>
      ) : (
        <div className="flex flex-col">
          {entries.map((e) => (
            <ChallengeRow key={e.userId} entry={e} standing={standingById.get(e.userId)} />
          ))}
        </div>
      )}

      {/* MI OBJETIVO + REGISTRAR AVANCE */}
      <div className="mt-1 flex flex-col gap-3 border border-[var(--acc)] p-4">
        <SectionLabel>{t.challenge.myGoal}</SectionLabel>

        {/* objetivo */}
        <input
          value={goal.desc}
          onChange={(e) => goal.setDesc(e.target.value)}
          placeholder={t.challenge.goalDescPlaceholder}
          className={inputClass}
        />
        <div className="font-mono text-[9px] tracking-[0.14em] text-[var(--faint2)] uppercase">
          {t.challenge.metricOptional}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input
            value={goal.mLabel}
            onChange={(e) => goal.setMLabel(e.target.value)}
            placeholder={t.challenge.metricLabelPlaceholder}
            className={inputClass}
          />
          <input
            value={goal.mUnit}
            onChange={(e) => goal.setMUnit(e.target.value)}
            placeholder={t.challenge.metricUnitPlaceholder}
            className={inputClass}
          />
          <input
            value={goal.mStart}
            onChange={(e) => goal.setMStart(e.target.value)}
            inputMode="decimal"
            placeholder={t.challenge.metricStartPlaceholder}
            className={inputClass}
          />
          <input
            value={goal.mTarget}
            onChange={(e) => goal.setMTarget(e.target.value)}
            inputMode="decimal"
            placeholder={t.challenge.metricTargetPlaceholder}
            className={inputClass}
          />
        </div>
        <button onClick={goal.onSaveGoal} disabled={!goal.desc.trim()} className={btnClass}>
          {goal.goalSaved ? t.challenge.saved : t.challenge.saveGoal}
        </button>

        {/* avance */}
        <div className="mt-1 font-mono text-[9px] tracking-[0.14em] text-[var(--faint2)] uppercase">
          {t.challenge.logProgress}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]">
          <input
            value={checkin.cVal}
            onChange={(e) => checkin.setCVal(e.target.value)}
            inputMode="decimal"
            placeholder={t.challenge.currentValuePlaceholder}
            className={inputClass}
          />
          <input
            value={checkin.cPct}
            onChange={(e) => checkin.setCPct(e.target.value)}
            inputMode="decimal"
            placeholder={t.challenge.pctPlaceholder}
            className={inputClass}
          />
          <input
            value={checkin.cNote}
            onChange={(e) => checkin.setCNote(e.target.value)}
            placeholder={t.challenge.notePlaceholder}
            className={inputClass}
          />
          <button onClick={checkin.onCheckin} className={btnClass}>
            {t.challenge.checkin}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Una fila del reto: objetivo + barra de progreso + esfuerzo-semanal/racha de la liga. */
function ChallengeRow({
  entry,
  standing,
}: {
  entry: ChallengeEntry;
  standing: StandingRow | undefined;
}) {
  const t = useT();
  const frac = progressFrac(entry);
  const pct = Math.round(frac * 100);
  const m = entry.metric;
  const metricStr = m
    ? `${m.label}${
        m.start !== null && m.target !== null ? ` ${m.start}→${m.target}` : ""
      }${m.unit ? ` ${m.unit}` : ""}`
    : null;

  return (
    <div
      className="flex flex-col gap-2 border border-[var(--rule2)] px-4 py-3 [&+&]:border-t-0"
      style={{
        background: entry.isMe ? "var(--acc)" : "transparent",
        color: entry.isMe ? "var(--on)" : "var(--fg)",
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-[14px] font-bold tracking-[-0.01em]">{entry.handle}</span>
          {entry.isMe && (
            <span
              className="flex-none font-mono text-[8.5px] font-semibold tracking-[0.14em]"
              style={{ color: "var(--on)" }}
            >
              {t.social.you}
            </span>
          )}
        </span>
        {standing && (
          <span
            className="flex-none font-mono text-[10px] tracking-[0.08em]"
            style={{ color: entry.isMe ? "var(--on)" : "var(--faint)" }}
          >
            {t.social.colEffort} {standing.weeklyEffort} · {t.social.colStreak} {standing.streak}
          </span>
        )}
      </div>

      <div
        className="font-mono text-[11px] leading-[1.4]"
        style={{ color: entry.isMe ? "var(--on)" : "var(--faint)" }}
      >
        {entry.description || t.challenge.noGoal}
        {metricStr && <span className="tracking-[0.04em]"> · {metricStr}</span>}
      </div>

      {/* barra de progreso */}
      <div className="flex items-center gap-2">
        <div
          className="h-2 min-w-0 flex-1 border"
          style={{ borderColor: entry.isMe ? "var(--on)" : "var(--rule2)" }}
        >
          <div
            className="h-full"
            style={{
              width: `${pct}%`,
              background: entry.isMe ? "var(--on)" : "var(--acc)",
            }}
          />
        </div>
        <span className="flex-none font-pixel text-[16px] tabular-nums">{pct}</span>
        <span
          className="flex-none font-mono text-[9px]"
          style={{ color: entry.isMe ? "var(--on)" : "var(--faint2)" }}
        >
          %
        </span>
      </div>

      {entry.latest?.note && (
        <div
          className="font-mono text-[10px] leading-[1.4] italic"
          style={{ color: entry.isMe ? "var(--on)" : "var(--faint2)" }}
        >
          {t.challenge.lastCheckin}: {entry.latest.note}
        </div>
      )}
    </div>
  );
}

/** Una fila publicada de standings (lo que devuelve listGroupStandings). */
type StandingRow = {
  userId: string;
  handle: string;
  formaElo: number;
  streak: number;
  level: number;
  weeklyEffort: number;
  adherence: number;
  isMe: boolean;
};

function StandingsTable({ standings }: { standings: StandingRow[] | undefined }) {
  const t = useT();
  // Orden client-side: por esfuerzo de la SEMANA (la carrera en curso) o por FORMA (el índice
  // persistente de largo plazo). Default SEMANA — el ranking que la liga ya mostraba.
  const [sortBy, setSortBy] = useState<"week" | "forma">("week");

  if (standings === undefined) {
    return <div className="font-mono text-[11px] text-[var(--faint)]">{t.social.loading}</div>;
  }
  if (standings.length === 0) {
    return (
      <div className="border border-[var(--rule2)] p-4 font-mono text-[11px] leading-[1.5] text-[var(--faint)]">
        {t.social.emptyStandings}
      </div>
    );
  }

  const sorted = [...standings].sort((a, b) =>
    sortBy === "forma" ? b.formaElo - a.formaElo : b.weeklyEffort - a.weeklyEffort,
  );
  const GRID = "grid-cols-[1.75rem_1fr_4rem_4rem_4.5rem_3.5rem_3rem]";

  return (
    <div className="flex flex-col gap-2">
      {/* toggle de orden — SEMANA / FORMA */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] tracking-[0.12em] text-[var(--faint2)]">
          {t.social.sortLabel}
        </span>
        <div className="flex">
          {(["week", "forma"] as const).map((key) => {
            const active = sortBy === key;
            return (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className="border border-[var(--rule2)] px-3 py-1 font-mono text-[10px] font-semibold tracking-[0.08em] [&+&]:border-l-0"
                style={{
                  background: active ? "var(--acc)" : "transparent",
                  color: active ? "var(--on)" : "var(--faint)",
                }}
              >
                {key === "week" ? t.social.sortWeek : t.social.sortForma}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-x-auto border border-[var(--rule2)]">
        {/* header row */}
        <div
          className={`grid min-w-[26rem] ${GRID} gap-2 border-b border-[var(--rule2)] px-4 py-2 font-mono text-[9px] font-semibold tracking-[0.14em] text-[var(--faint2)]`}
        >
          <span>{t.social.colRank}</span>
          <span>{t.social.colAthlete}</span>
          <span className="text-right">{t.social.colForma}</span>
          <span className="text-right">{t.social.colAdherence}</span>
          <span className="text-right">{t.social.colEffort}</span>
          <span className="text-right">{t.social.colStreak}</span>
          <span className="text-right">{t.social.colLevel}</span>
        </div>
        {sorted.map((row, i) => (
          <div
            key={row.userId}
            className={`grid min-w-[26rem] ${GRID} items-center gap-2 px-4 py-2.5 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-[var(--rule)]`}
            style={{
              background: row.isMe ? "var(--acc)" : "transparent",
              color: row.isMe ? "var(--on)" : "var(--fg)",
            }}
          >
            <span className="font-pixel text-[16px] tabular-nums">{i + 1}</span>
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate text-[14px] font-bold tracking-[-0.01em]">{row.handle}</span>
              {row.isMe && (
                <span
                  className="flex-none font-mono text-[8.5px] font-semibold tracking-[0.14em]"
                  style={{ color: row.isMe ? "var(--on)" : "var(--faint2)" }}
                >
                  {t.social.you}
                </span>
              )}
            </span>
            <span className="text-right font-pixel text-[18px] tabular-nums">{row.formaElo}</span>
            <span className="flex items-baseline justify-end gap-0.5">
              <span className="font-pixel text-[18px] tabular-nums">
                {Math.round(row.adherence * 100)}
              </span>
              <span
                className="font-mono text-[9px]"
                style={{ color: row.isMe ? "var(--on)" : "var(--faint2)" }}
              >
                %
              </span>
            </span>
            <span className="text-right font-pixel text-[18px] tabular-nums">{row.weeklyEffort}</span>
            <span className="text-right font-pixel text-[16px] tabular-nums">{row.streak}</span>
            <span className="text-right font-pixel text-[16px] tabular-nums">{row.level}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] font-semibold tracking-[0.2em] text-[var(--faint)] uppercase">
      {children}
    </div>
  );
}
