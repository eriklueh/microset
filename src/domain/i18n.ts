/**
 * English names for the seed content (exercises, variants, equipment, methodologies).
 * The seed itself stays Spanish (source of truth); these maps localize it by id when
 * the language is English. Custom/user content has no entry → falls back to as-entered.
 */
import { METHODOLOGIES, type Methodology } from "@/domain/methodologies";
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

const METHODOLOGY_EN: Record<string, { name: string; tagline: string; description: string }> = {
  gtg: {
    name: "Grease the Groove",
    tagline: "Submaximal sets, frequent and spread out",
    description:
      "Many short sets through the day, always far from failure (leave 2-3 reps in the tank). Build strength and technique without fatigue. It's the heart of microset.",
  },
  volume: {
    name: "Volume",
    tagline: "Accumulate work with moderate reps",
    description:
      "More sets per exercise with medium reps and shorter rest. Good for hypertrophy and muscular endurance.",
  },
  strength: {
    name: "Strength",
    tagline: "Few sets, intense",
    description:
      "Fewer but demanding sets (hard variants or weighted) with more rest between each. To push your max.",
  },
  maintenance: {
    name: "Maintenance",
    tagline: "Just enough to hold",
    description: "Low volume to keep what you've gained during heavy weeks or when short on time.",
  },
  free: {
    name: "Free",
    tagline: "You set sets and rest",
    description: "No template: adjust everything by hand, per exercise.",
  },
};

/** Localized methodology list/lookup (EN overrides name/tagline/description by id). */
export function useMethodologies(): {
  all: Methodology[];
  byId: (id: string) => Methodology | undefined;
} {
  const lang = useLang();
  const all =
    lang === "en"
      ? METHODOLOGIES.map((m) => ({ ...m, ...(METHODOLOGY_EN[m.id] ?? {}) }))
      : METHODOLOGIES;
  return { all, byId: (id) => all.find((m) => m.id === id) };
}
