/** A training methodology preset that parametrizes the whole routine. */
export interface Methodology {
  id: string;
  name: string;
  tagline: string;
  description: string;
  /** Sets per exercise to apply across the routine. 0 = don't change (manual). */
  sets: number;
  /** Minutes between sets. 0 = don't change (manual). */
  minRest: number;
}

export const METHODOLOGIES: Methodology[] = [
  {
    id: "gtg",
    name: "Grease the Groove",
    tagline: "Series submáximas, frecuentes y repartidas",
    description:
      "Muchas series cortas a lo largo del día, siempre lejos del fallo (dejá 2-3 reps en el tanque). Gana fuerza y técnica sin fatigarte. Es el corazón de microset.",
    sets: 5,
    minRest: 60,
  },
  {
    id: "volume",
    name: "Volumen",
    tagline: "Acumular trabajo con reps moderadas",
    description:
      "Más series por ejercicio con reps medias y descanso más corto. Bueno para hipertrofia y resistencia muscular.",
    sets: 6,
    minRest: 40,
  },
  {
    id: "strength",
    name: "Fuerza",
    tagline: "Pocas series, intensas",
    description:
      "Menos series pero exigentes (variantes difíciles o con peso) y más descanso entre cada una. Para empujar tu máximo.",
    sets: 4,
    minRest: 90,
  },
  {
    id: "maintenance",
    name: "Mantenimiento",
    tagline: "Lo justo para sostener",
    description:
      "Volumen bajo para mantener lo ganado en semanas cargadas o con poco tiempo.",
    sets: 2,
    minRest: 90,
  },
  {
    id: "free",
    name: "Libre",
    tagline: "Vos definís series y descanso",
    description: "Sin plantilla: ajustás todo a mano, por ejercicio.",
    sets: 0,
    minRest: 0,
  },
];

export function methodologyById(id: string): Methodology | undefined {
  return METHODOLOGIES.find((m) => m.id === id);
}
