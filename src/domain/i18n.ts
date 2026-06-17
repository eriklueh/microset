/**
 * English names for the seed content (exercises, variants, equipment, intensities).
 * The seed itself stays Spanish (source of truth); these maps localize it by id when
 * the language is English. Custom/user content has no entry → falls back to as-entered.
 */
import { INTENSITIES, type Intensity } from "@/domain/intensity";
import { useLang } from "@/lib/i18n";

export const EXERCISE_EN: Record<string, string> = {
  pullups: "Pull-ups",
  chinups: "Chin-ups",
  "hanging-leg-raises": "Hanging leg raises",
  dips: "Dips",
  lsit: "L-sit",
  "parallette-pushups": "Parallette push-ups",
  "tuck-planche": "Tuck planche",
  "band-rows": "Band rows",
  "band-pullaparts": "Band pull-aparts",
  "band-facepulls": "Band face pulls",
  squats: "Squats",
  lunges: "Lunges",
  "bulgarian-split-squat": "Bulgarian split squat",
  "glute-bridge": "Glute bridge",
};

export const VARIANT_EN: Record<string, string> = {
  "b-wide": "Wide band",
  "b-mid": "Medium band",
  "b-thin": "Thin band",
  bw: "Bodyweight",
  load: "Weighted",
  knees: "Knees",
  "knees-chest": "Knees to chest",
  straight: "Straight legs",
  tuck: "Tuck",
  "one-leg": "One leg",
  full: "Full L-sit",
  incline: "Incline",
  flat: "Flat",
  "feet-up": "Feet up",
  "adv-tuck": "Advanced tuck",
  straddle: "Straddle",
};

export const EQUIPMENT_EN: Record<string, string> = {
  "pullup-bar": "Pull-up bar",
  "dip-bars": "Dip bars",
  parallettes: "Parallettes",
  bands: "Bands",
};

const INTENSITY_EN: Record<string, { name: string; tagline: string; description: string }> = {
  deload: {
    name: "Deload",
    tagline: "Less volume for a few days",
    description:
      "Schedules ~half the sets that day. For deload weeks, fatigue or low time. Doesn't touch your routine — just programs fewer.",
  },
  normal: {
    name: "Normal",
    tagline: "Your routine as-is",
    description: "The sets you configured per exercise, unchanged.",
  },
  push: {
    name: "Push",
    tagline: "More volume that day",
    description: "Bumps volume ~1.5×. For loading days — make sure it fits your schedule.",
  },
};

/** Localized intensity list/lookup (EN overrides name/tagline/description by id). */
export function useIntensities(): {
  all: Intensity[];
  byId: (id: string) => Intensity | undefined;
} {
  const lang = useLang();
  const all =
    lang === "en"
      ? INTENSITIES.map((m) => ({ ...m, ...(INTENSITY_EN[m.id] ?? {}) }))
      : INTENSITIES;
  return { all, byId: (id) => all.find((m) => m.id === id) };
}
