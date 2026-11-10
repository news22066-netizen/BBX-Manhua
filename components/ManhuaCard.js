import Link from 'next/link';
import { proxied } from '@/lib/proxy';

const WEEK = 7 * 24 * 60 * 60 * 1000;

export default function ManhuaCard({ m }) {
  const pct = Math.max(0, Math.min(100, ((m.rating ?? 0) / 10) * 100));
  const stars5 = ((m.rating ?? 0) / 2).toFixed(1);
  const now = Date.now();

  return (
    <article className="flex min-w-0 flex-col gap-2">
      <Link
        href={`/manhua/${m.id}`}
        className="relative block aspect-[2/3] overflow-hidden rounded-md bg-neutral-200 dark:bg-neutral-800"
      >
        {m.cover_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxied(m.cover_url)}
            alt={`${m.title} cover`}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        )}
      </Link>

      <div className="flex items-center gap-1.5 text-xs" aria-label={`Rating ${stars5} out of 5`}>
        <span className="relative inline-block leading-none tracking-tighter text-neutral-300 dark:text-neutral-700" aria-hidden="true">
          ★★★★★
          <span className="absolute inset-y-0 left-0 overflow-hidden whitespace-nowrap text-black dark:text-white" style={{ width: `${pct}%` }}>
            ★★★★★
          </span>
        </span>
        <span className="font-semibold">{stars5}</span>
      </div>

      <h3 className="line-clamp-2 text-sm font-semibold leading-snug">
        <Link href={`/manhua/${m.id}`} className="hover:text-accent">{m.title}</Link>
      </h3>

      <ul className="flex flex-col gap-1.5">
        {(m.chapters ?? []).map((c) => {
          const isNew = c.published_at && now - new Date(c.published_at).getTime() < WEEK;
          return (
            <li key={c.chapter_number}>
              <Link
                href={`/manhua/${m.id}/${c.chapter_number}`}
                className="flex items-center justify-between gap-2 rounded-full bg-neutral-200 px-3 py-1 text-xs font-medium text-black hover:bg-accent hover:text-accent-fg dark:bg-neutral-800 dark:text-white"
              >
                <span className="truncate">Chapter {c.chapter_number}</span>
                {isNew ? (
                  <span className="rounded-full bg-accent px-1.5 py-px text-[10px] font-bold text-accent-fg">NEW</span>
                ) : (
                  c.published_at && (
                    <span className="shrink-0 text-[10px] font-normal opacity-60">
                      {new Date(c.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
                    </span>
                  )
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
