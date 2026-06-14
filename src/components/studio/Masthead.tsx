/** Brutalist view masthead: XL uppercase title + mono sub + thick rule. */
export function Masthead({ title, sub }: { title: string; sub: string }) {
  return (
    <>
      <h2 className="text-[46px] leading-[0.85] font-extrabold tracking-[-0.04em] text-[var(--fg)] uppercase">
        {title}
      </h2>
      <div className="mt-3 font-mono text-[10.5px] tracking-[0.12em] text-[var(--faint)]">
        {sub}
      </div>
      <div className="my-[20px] h-0.5 bg-[var(--fg)]" />
    </>
  );
}
