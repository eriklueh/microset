import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { SignedIn, SignedOut, SignIn, useUser } from "@clerk/clerk-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useT } from "@/lib/i18n";
import { currentSeasonId } from "@/lib/social";
import { useCatalog } from "@/hooks/useCatalog";
import { computeLevels, type PlanContext } from "@/lib/levels";
import { activityFromLogs } from "@/modules/pausa/pausa";
import { effectiveSlot, REST, useStore } from "@/store/useStore";
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
  const { user } = useUser();
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

  // --- my derived stats (same projection the rest of the app uses) -----------
  const logs = useStore((s) => s.logs);
  const dayTypes = useStore((s) => s.dayTypes);
  const week = useStore((s) => s.week);
  const dayOverrides = useStore((s) => s.dayOverrides);
  const streakFreeze = useStore((s) => s.streakFreeze);
  const { byId } = useCatalog();

  const plan = useMemo<PlanContext>(
    () => ({
      intensityByDayType: Object.fromEntries(dayTypes.map((d) => [d.id, d.intensity])),
      slotForDate: (key) => effectiveSlot(week, dayOverrides, key),
      rest: REST,
    }),
    [dayTypes, week, dayOverrides],
  );

  const myStats = useMemo(() => {
    const levels = computeLevels(logs, plan, byId, streakFreeze);
    const weeklyEffort = Math.round(
      activityFromLogs(logs, byId)
        .filter((e) => currentSeasonId(new Date(e.at)) === season)
        .reduce((n, e) => n + (e.metrics?.effortXp ?? 0), 0),
    );
    return { streak: levels.streak, level: levels.rank, weeklyEffort };
  }, [logs, plan, byId, streakFreeze, season]);

  const standings = useQuery(
    api.social.listGroupStandings,
    selectedId ? { groupId: selectedId, seasonId: season } : "skip",
  );
  const selectedGroup = groups?.find((g) => g.id === selectedId) ?? null;

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
    if (selectedId === groupId) setSelectedId(null);
  };

  const onPublish = async () => {
    if (!selectedId) return;
    setPublishState("busy");
    try {
      const handle = user?.username || user?.firstName || "Atleta";
      await upsertMyStandings({
        groupId: selectedId,
        seasonId: season,
        handle,
        formaElo: 1000, // placeholder hasta construir FORMA
        streak: myStats.streak,
        level: myStats.level,
        weeklyEffort: myStats.weeklyEffort,
      });
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
              <button
                onClick={onPublish}
                disabled={publishState === "busy"}
                className="border border-[var(--acc)] bg-[var(--acc)] px-4 py-2 font-mono text-[11px] font-semibold tracking-[0.06em] text-[var(--on)] hover:opacity-85 disabled:opacity-50"
              >
                {publishState === "busy"
                  ? t.social.publishing
                  : publishState === "done"
                    ? t.social.published
                    : t.social.publish}
              </button>
              <button
                onClick={() => onLeave(selectedId)}
                className="border border-[var(--rule2)] px-4 py-2 font-mono text-[11px] tracking-[0.06em] text-[var(--faint)] hover:border-[var(--fg)] hover:text-[var(--fg)]"
              >
                {t.social.leave}
              </button>
            </div>
            <StandingsTable standings={standings} />
          </>
        )}
      </section>
    </div>
  );
}

function StandingsTable({
  standings,
}: {
  standings:
    | {
        userId: string;
        handle: string;
        formaElo: number;
        streak: number;
        level: number;
        weeklyEffort: number;
        isMe: boolean;
      }[]
    | undefined;
}) {
  const t = useT();
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
  return (
    <div className="border border-[var(--rule2)]">
      {/* header row */}
      <div className="grid grid-cols-[2rem_1fr_5rem_4rem_3.5rem] gap-2 border-b border-[var(--rule2)] px-4 py-2 font-mono text-[9px] font-semibold tracking-[0.14em] text-[var(--faint2)]">
        <span>{t.social.colRank}</span>
        <span>{t.social.colAthlete}</span>
        <span className="text-right">{t.social.colEffort}</span>
        <span className="text-right">{t.social.colStreak}</span>
        <span className="text-right">{t.social.colLevel}</span>
      </div>
      {standings.map((row, i) => (
        <div
          key={row.userId}
          className="grid grid-cols-[2rem_1fr_5rem_4rem_3.5rem] items-center gap-2 px-4 py-2.5 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-[var(--rule)]"
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
          <span className="text-right font-pixel text-[18px] tabular-nums">{row.weeklyEffort}</span>
          <span className="text-right font-pixel text-[16px] tabular-nums">{row.streak}</span>
          <span className="text-right font-pixel text-[16px] tabular-nums">{row.level}</span>
        </div>
      ))}
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
