import { useT } from "@/lib/i18n";
import { currentSeasonId } from "@/lib/social";
import { ViewHeader } from "./shell";

/** True only when both cloud envs are present at build time. When false the app still runs
 *  fully local — this view just explains that the cloud layer isn't configured. */
const CLOUD_READY =
  !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY && !!import.meta.env.VITE_CONVEX_URL;

/**
 * AMIGOS — the social/league surface (F4). INCREMENTO 1: placeholder only. The real
 * standings + group management land in the next increment. Mounted only when the `social`
 * module is enabled (see Sidebar/App), so with the module off this file is never rendered.
 */
export function SocialView() {
  const t = useT();
  return (
    <div className="flex h-full flex-col">
      <ViewHeader kicker={t.social.sub} title={t.social.title} />
      <section className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
        {CLOUD_READY ? (
          <div className="flex flex-col gap-2">
            <div className="font-mono text-[13px] tracking-[0.04em] text-[var(--fg)]">
              {t.social.leagueSoon}
            </div>
            <div className="font-mono text-[10px] tracking-[0.14em] text-[var(--faint)]">
              {t.social.season} · {currentSeasonId()}
            </div>
          </div>
        ) : (
          <div className="border border-[var(--rule2)] p-4 font-mono text-[12px] leading-[1.5] text-[var(--faint)]">
            {t.social.noCloud}
          </div>
        )}
      </section>
    </div>
  );
}
