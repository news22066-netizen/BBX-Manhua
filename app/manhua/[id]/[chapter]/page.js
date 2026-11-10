import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { proxied } from '@/lib/proxy';
import ThemeToggle from '@/components/ThemeToggle';

// The at-home base URL / tokens are temporary, so this page must be rendered per request.
export const dynamic = 'force-dynamic';

/** Resolves page image URLs server-side from MangaDex's at-home API. */
async function resolvePages(sourceChapterId, quality) {
  const res = await fetch(`https://api.mangadex.org/at-home/server/${sourceChapterId}`, {
    cache: 'no-store',
    headers: { 'User-Agent': 'ManhuaReader/1.0 (personal project)' },
  });
  if (!res.ok) return null;
  const { baseUrl, chapter } = await res.json();
  const useHigh = quality === 'high' || !chapter.dataSaver?.length;
  const dir = useHigh ? 'data' : 'data-saver';
  const files = useHigh ? chapter.data : chapter.dataSaver;
  return files.map((f) => `${baseUrl}/${dir}/${chapter.hash}/${f}`);
}

export async function generateMetadata({ params }) {
  const { id, chapter } = await params;
  const { data } = await supabase.from('manhuas').select('title').eq('id', id).single();
  return { title: data ? `${data.title} – Chapter ${chapter}` : 'Reader' };
}

function NavBar({ id, prev, next, quality, num }) {
  const btn =
    'rounded-md px-4 py-2 text-sm font-semibold transition';
  const on = `${btn} bg-accent text-accent-fg hover:bg-accent-bright`;
  const off = `${btn} cursor-not-allowed border border-neutral-300 text-neutral-400 dark:border-neutral-700 dark:text-neutral-600`;
  const q = quality === 'high' ? '?quality=high' : '';
  return (
    <div className="flex items-center justify-between gap-2">
      {prev ? <Link href={`/manhua/${id}/${prev.chapter_number}${q}`} className={on}>Prev</Link> : <span className={off}>Prev</span>}
      <Link href={`/manhua/${id}`} className="truncate text-sm font-medium hover:text-accent">Chapter {num} · all chapters</Link>
      {next ? <Link href={`/manhua/${id}/${next.chapter_number}${q}`} className={on}>Next</Link> : <span className={off}>Next</span>}
    </div>
  );
}

export default async function ReaderPage({ params, searchParams }) {
  const { id, chapter } = await params;
  const sp = await searchParams;
  const quality = sp?.quality === 'high' ? 'high' : 'saver';
  const num = Number(chapter);
  if (Number.isNaN(num)) notFound();

  const { data: ch } = await supabase
    .from('chapters')
    .select('chapter_number, source_chapter_id, manhuas(title)')
    .eq('manhua_id', id)
    .eq('chapter_number', num)
    .maybeSingle();
  if (!ch) notFound();

  const [{ data: prevRows }, { data: nextRows }, pages] = await Promise.all([
    supabase.from('chapters').select('chapter_number').eq('manhua_id', id).lt('chapter_number', num).order('chapter_number', { ascending: false }).limit(1),
    supabase.from('chapters').select('chapter_number').eq('manhua_id', id).gt('chapter_number', num).order('chapter_number', { ascending: true }).limit(1),
    resolvePages(ch.source_chapter_id, quality),
  ]);
  const prev = prevRows?.[0];
  const next = nextRows?.[0];

  return (
    <div className="bg-white text-black dark:bg-black dark:text-white">
      <div className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 backdrop-blur dark:border-neutral-800 dark:bg-black/95">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-3 py-2">
          <div className="min-w-0 flex-1">
            <NavBar id={id} prev={prev} next={next} quality={quality} num={ch.chapter_number} />
          </div>
          <ThemeToggle />
        </div>
      </div>

      <main className="mx-auto max-w-3xl">
        <h1 className="px-4 py-4 text-center text-sm font-semibold text-neutral-500">
          {ch.manhuas?.title} — Chapter {ch.chapter_number}
        </h1>

        {!pages ? (
          <div className="px-4 py-24 text-center">
            <p className="font-semibold">This chapter&apos;s images could not be loaded.</p>
            <p className="mt-1 text-sm text-neutral-500">The image server may be busy. Reload to try again.</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {pages.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={proxied(url)}
                alt={`Page ${i + 1}`}
                loading={i < 2 ? 'eager' : 'lazy'}
                fetchPriority={i === 0 ? 'high' : 'auto'}
                decoding="async"
                className="block h-auto min-h-[40vh] w-full bg-neutral-100 dark:bg-neutral-900"
              />
            ))}
          </div>
        )}

        <div className="px-3 py-8">
          <NavBar id={id} prev={prev} next={next} quality={quality} num={ch.chapter_number} />
          <p className="mt-4 text-center text-xs text-neutral-500">
            {quality === 'high' ? (
              <Link href={`/manhua/${id}/${chapter}`} className="underline hover:text-accent">Switch to data saver</Link>
            ) : (
              <Link href={`/manhua/${id}/${chapter}?quality=high`} className="underline hover:text-accent">Switch to high quality</Link>
            )}
          </p>
        </div>
      </main>
    </div>
  );
}
