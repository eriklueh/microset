import { Masthead } from "./Masthead";

const ACC_DIM = "color-mix(in oklch, var(--acc) 18%, transparent)";

const CAPS = [
  { n: "01", t: "Tus objetivos", d: "Fuerza, tu primer muscle-up, bajar grasa: a dónde querés llegar." },
  { n: "02", t: "Tu dieta", d: "Cómo comés para ajustar volumen, frecuencia y descanso." },
  { n: "03", t: "Tus días", d: "Qué días son home office y cuáles de oficina." },
  { n: "04", t: "Tu equipo", d: "Recomienda ejercicios con lo que tenés en casa." },
];

export function CoachView({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col px-[34px] py-[30px]">
      <Masthead title="COACH" sub="AGENTE IA · PRÓXIMAMENTE" />

      <div className="relative border border-[var(--rule2)] p-[26px]">
        <div className="absolute top-0 left-0 h-1 w-[60px] bg-[var(--acc)]" />
        <div className="font-mono text-[10px] font-semibold tracking-[0.18em] text-[var(--acc)]">
          ▢ PRÓXIMAMENTE
        </div>
        <div className="mt-3.5 text-[38px] leading-[0.95] font-extrabold tracking-[-0.03em] text-[var(--fg)] uppercase">
          Tu coach
          <br />
          inteligente
        </div>
        <p className="mt-4 max-w-[520px] text-[13.5px] leading-[1.6] text-[var(--dim)]">
          Contale tus objetivos, tu dieta, tu equipo y tus horarios. El coach arma un calendario
          a tu medida; microset lo reparte y te avisa cuando toca.
        </p>
        <div className="mt-[22px] flex gap-2.5">
          <button
            disabled
            className="cursor-not-allowed px-[22px] py-3 font-mono text-[12px] font-semibold tracking-[0.06em] text-[var(--faint)]"
            style={{ background: ACC_DIM }}
          >
            HABLAR CON EL COACH
          </button>
          <button
            onClick={onStart}
            className="border-2 border-[var(--fg)] px-[22px] py-3 font-mono text-[12px] font-semibold tracking-[0.06em] text-[var(--fg)]"
          >
            VER MI DÍA
          </button>
        </div>
      </div>

      <div className="mt-[22px] grid grid-cols-2 border border-[var(--rule)]">
        {CAPS.map((c, i) => (
          <div
            key={c.n}
            className={`p-5 ${i % 2 === 0 ? "border-r border-[var(--rule)]" : ""} ${i < 2 ? "border-b border-[var(--rule)]" : ""}`}
          >
            <span className="font-mono text-[10px] text-[var(--faint2)]">{c.n}</span>
            <div className="mt-2 text-[17px] font-bold text-[var(--fg)]">{c.t}</div>
            <p className="mt-1.5 text-[12.5px] leading-[1.5] text-[var(--faint)]">{c.d}</p>
          </div>
        ))}
      </div>

      <div className="mt-[22px] flex items-center border border-[var(--rule2)]">
        <span className="flex-1 px-4 py-[13px] text-[13.5px] text-[var(--faint2)]">
          Contale a tu coach qué querés lograr…
        </span>
        <span
          className="px-[22px] py-[13px] font-mono text-[12px] font-semibold tracking-[0.06em] text-[var(--faint)]"
          style={{ background: ACC_DIM }}
        >
          ENVIAR
        </span>
      </div>
    </div>
  );
}
