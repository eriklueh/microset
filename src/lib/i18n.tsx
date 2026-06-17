/** React glue for i18n: the `useT` hook (reads lang from the store) + a selector. */
import { useStore } from "@/store/useStore";
import { STRINGS, type Dict, type Lang } from "@/lib/strings";

/** Current language's dictionary. Components re-render when the language changes. */
export function useT(): Dict {
  return STRINGS[useStore((s) => s.lang)];
}

/** The current language code (for localizing domain content by id). */
export function useLang(): Lang {
  return useStore((s) => s.lang);
}

/** ES / EN segmented selector (used in Ajustes). */
export function LangSelect() {
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  return (
    <div className="flex">
      {(["es", "en"] as Lang[]).map((l, i) => {
        const on = lang === l;
        return (
          <button
            key={l}
            onClick={() => setLang(l)}
            className="border px-3 py-1.5 font-mono text-[11px] font-semibold tracking-[0.06em]"
            style={{
              borderColor: on ? "var(--acc)" : "var(--rule2)",
              background: on ? "var(--acc)" : "transparent",
              color: on ? "var(--on)" : "var(--dim)",
              marginLeft: i ? -1 : 0,
              position: "relative",
              zIndex: on ? 1 : 0,
            }}
          >
            {l.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
