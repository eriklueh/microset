import { Bot, Calendar, Dumbbell, Salad, Target } from "lucide-react";
import { Button } from "@/components/ui/button";

const CARD = "rounded-xl border bg-card/60 backdrop-blur-xl";

const CAPABILITIES = [
  {
    icon: Target,
    title: "Tus objetivos",
    desc: "Fuerza, tu primer muscle-up, bajar grasa: le decís a dónde querés llegar.",
  },
  {
    icon: Salad,
    title: "Tu dieta",
    desc: "Considera cómo comés para ajustar volumen, frecuencia y descanso.",
  },
  {
    icon: Calendar,
    title: "Tus días",
    desc: "Sabe qué días son home office y cuáles de oficina, y arma el plan acorde.",
  },
  {
    icon: Dumbbell,
    title: "Tu equipo",
    desc: "Recomienda ejercicios con lo que tenés en casa.",
  },
];

export function CoachView({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className={`${CARD} relative overflow-hidden p-5`}>
        <div className="bg-primary absolute inset-x-0 top-0 h-0.5" />
        <div className="text-muted-foreground mb-3 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase">
          <Bot className="size-3" /> Próximamente
        </div>
        <h2 className="text-xl font-semibold tracking-tight">Tu coach inteligente</h2>
        <p className="text-muted-foreground mt-1.5 max-w-md text-sm leading-relaxed">
          Contale tus objetivos, tu dieta, tu equipo y tus horarios. El coach arma un
          calendario de entrenamiento a tu medida; después microset lo reparte en tu día
          y te avisa cuando toca.
        </p>
        <div className="mt-4 flex gap-2">
          <Button size="sm" disabled>
            Hablar con el coach
          </Button>
          <Button size="sm" variant="outline" onClick={onStart}>
            Ver mi día
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {CAPABILITIES.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.title} className={`${CARD} flex flex-col gap-2 p-4`}>
              <Icon className="text-primary size-5" />
              <div className="text-sm font-medium">{c.title}</div>
              <div className="text-muted-foreground text-xs leading-relaxed">{c.desc}</div>
            </div>
          );
        })}
      </div>

      <div className={`${CARD} flex items-center gap-2 p-2 pl-3`}>
        <input
          disabled
          placeholder="Contale a tu coach qué querés lograr…"
          className="text-muted-foreground placeholder:text-muted-foreground/60 flex-1 cursor-not-allowed bg-transparent text-sm outline-none"
        />
        <Button size="sm" disabled>
          Enviar
        </Button>
      </div>
    </div>
  );
}
