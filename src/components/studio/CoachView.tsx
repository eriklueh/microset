import { Masthead } from "./Masthead";
import { useStore } from "@/store/useStore";

const ACC_DIM = "color-mix(in oklch, var(--acc) 18%, transparent)";
const field =
  "w-full resize-none border border-[var(--rule2)] bg-transparent px-3 py-2.5 text-[13.5px] leading-[1.5] text-[var(--fg)] outline-none focus:border-[var(--acc)] placeholder:text-[var(--faint2)]";

export function CoachView({ onStart }: { onStart: () => void }) {
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);

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
          Va a leer tu equipo, tu progreso y el perfil de abajo para armar y ajustar tu rutina y tu
          semana. Vos aprobás los cambios antes de que se apliquen.
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

      <div className="mt-6 flex items-center justify-between">
        <span className="font-mono text-[10px] font-semibold tracking-[0.16em] text-[var(--faint)]">
          TU PERFIL
        </span>
        <span className="font-mono text-[9.5px] tracking-[0.1em] text-[var(--faint2)]">SE GUARDA SOLO</span>
      </div>
      <p className="mt-2 text-[12.5px] leading-[1.5] text-[var(--faint)]">
        Mientras llega el coach, dejá tu info acá — la va a usar como punto de partida.
      </p>

      <div className="mt-3 flex flex-col gap-4">
        <Field
          label="OBJETIVOS"
          value={profile.goals}
          onChange={(v) => setProfile({ goals: v })}
          placeholder="Ej: mi primer muscle-up, 12 dominadas seguidas, bajar grasa…"
        />
        <Field
          label="DIETA"
          value={profile.diet}
          onChange={(v) => setProfile({ diet: v })}
          placeholder="Ej: superávit leve, ~140 g de proteína, ayuno hasta el mediodía…"
        />
        <Field
          label="RESTRICCIONES Y NOTAS"
          value={profile.constraints}
          onChange={(v) => setProfile({ constraints: v })}
          placeholder="Ej: molestia en hombro derecho, sin saltos por los vecinos…"
        />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] tracking-[0.1em] text-[var(--faint)]">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder={placeholder}
        rows={2}
        className={field}
      />
    </label>
  );
}
