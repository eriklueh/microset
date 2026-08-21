/**
 * Social layer · pure helpers (F4 — capa social, ver docs/VISION.md §6).
 *
 * The league resets every ISO week. The season key is derived CLIENT-SIDE from the local
 * calendar so there is no server clock to trust and no extra state to persist — every
 * device agrees on the same "AAAA-Wnn" bucket for a given day.
 */

/** Thursday (local midnight) of the ISO week that `x` falls in. ISO 8601 anchors a week's
 *  year on its Thursday, so this single move makes both the year and the week deterministic. */
function isoThursday(x: Date): Date {
  const t = new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const dow = (t.getDay() + 6) % 7; // Mon=0 … Sun=6
  t.setDate(t.getDate() - dow + 3); // step to Thursday of this week
  return t;
}

/**
 * The current league season key as `AAAA-Wnn` (ISO 8601 week-numbering year + zero-padded
 * week), computed in LOCAL time. E.g. `2026-W34`. Deterministic and side-effect-free.
 */
export function currentSeasonId(d: Date = new Date()): string {
  const target = isoThursday(d);
  const isoYear = target.getFullYear();
  // Jan 4 is always in ISO week 1; its Thursday anchors week 1 of the ISO year.
  const week1Thursday = isoThursday(new Date(isoYear, 0, 4));
  const week = 1 + Math.round((target.getTime() - week1Thursday.getTime()) / 604_800_000);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}
