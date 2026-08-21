import { useMemo } from "react";
import { useUser } from "@clerk/clerk-react";
import { useCatalog } from "@/hooks/useCatalog";
import { computeLevels, type PlanContext } from "@/lib/levels";
import { activityFromLogs } from "@/modules/pausa/pausa";
import { computeAdherence, computeForma, currentSeasonId, type EffortSample } from "@/lib/social";
import { effectiveSlot, REST, useStore } from "@/store/useStore";

/**
 * MI fila publicable de standings (capa social F4) — la ÚNICA fuente de la proyección
 * "mis stats" que sube a la liga, para que auto-publish y el botón manual publiquen lo mismo.
 *
 * Todo se deriva de los mismos logs/plan que ya usa el resto de la app (ProgressView):
 * `streak`/`level` de computeLevels, `weeklyEffort` = Σ effortXp de esta temporada, la
 * `adherence` (día-level, ver `computeAdherence`) y `formaElo` = FORMA (índice persistente que
 * decae, ver `computeForma`) — ambos derivados del MISMO stream que weeklyEffort.
 *
 * Usa Clerk `useUser`, así que SOLO debe llamarse dentro del árbol CLOUD_READY + <SignedIn>.
 */
export interface MyStandings {
  handle: string;
  streak: number;
  level: number;
  weeklyEffort: number;
  /** 0..1 — días entrenados / días programados de esta semana hasta hoy. */
  adherence: number;
  formaElo: number;
}

export function useMyStandings(): MyStandings {
  const { user } = useUser();
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

  const handle = user?.username || user?.firstName || "Atleta";

  return useMemo(() => {
    const season = currentSeasonId();
    const levels = computeLevels(logs, plan, byId, streakFreeze);
    // Un único paso por el stream: weeklyEffort mira sólo esta temporada; FORMA mira TODO el
    // historial (EMA multi-semana). Misma fuente ⇒ misma "moneda de esfuerzo" y misma "semana".
    const events = activityFromLogs(logs, byId);
    const weeklyEffort = Math.round(
      events
        .filter((e) => currentSeasonId(new Date(e.at)) === season)
        .reduce((n, e) => n + (e.metrics?.effortXp ?? 0), 0),
    );
    const samples: EffortSample[] = events.map((e) => ({
      at: e.at,
      effortXp: e.metrics?.effortXp ?? 0,
    }));
    const adherence = computeAdherence(logs, plan.slotForDate, plan.rest);
    return {
      handle,
      streak: levels.streak,
      level: levels.rank,
      weeklyEffort,
      adherence,
      formaElo: computeForma(samples),
    };
  }, [logs, plan, byId, streakFreeze, handle]);
}
