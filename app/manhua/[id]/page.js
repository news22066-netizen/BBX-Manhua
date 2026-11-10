import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { proxied } from '@/lib/proxy';

export const revalidate = 300;

export async function generateMetadata({ params }) {
  const { id } = await params;
  const { data } = await supabase.from('manhuas').select('title').eq('id', id).single();
  return { title: data ? `${data.title} – Manhua Reader` : 'Manhua Reader' };
}

export default async function ManhuaPage({ params }) {
  const { id } = await params;
  const [{ data: m }, { data: chapters }] = await Promise.all([
    supabase.from('manhuas').select('*').eq('id', id).single(),
    supabase.from('chapters').select('chapter_number, published_at').eq('manhua_id', id).order('chapter_number', { ascending: false }),
  ]);
  if (!m) notFound();

  const first = chapters?.[chapters.length - 1];
  const latest = chapters?.[0];

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="mx-auto w-48 shrink-0 sm:mx-0">
          {m.cover_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxied(m.cover_url)} alt={`${m.title} cover`} className="aspect-[2/3] w-full rounded-md object-cover" />
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{m.title}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {m.rating ? `${(m.rating / 2).toFixed(1)} / 5` : 'Not rated'} · {m.status ?? 'unknown'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {m.genres.map((g) => (
              <Link key={g} href={`/home?genre=${encodeURIComponent(g)}`} className="rounded-full border border-neutral-300 px-3 py-1 text-xs hover:border-accent dark:border-neutral-700">
                {g}
              </Link>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            {first && (
              <Link href={`/manhua/${id}/${first.chapter_number}`} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-black hover:bg-accent-bright">
                Read first
              </Link>
            )}
            {latest && (
              <Link href={`/manhua/${id}/${latest.chapter_number}`} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-black hover:bg-accent-bright">
                Read last
              </Link>
            )}
          </div>
          {m.description && (
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
              {m.description}
            </p>
          )}
        </div>
      </div>

      <h2 className="mb-3 mt-10 text-lg font-bold">Chapters ({chapters?.length ?? 0})</h2>
      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {chapters?.map((c) => (
          <li key={c.chapter_number}>
            <Link href={`/manhua/${id}/${c.chapter_number}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900">
              <span className="font-medium">Chapter {c.chapter_number}</span>
              {c.published_at && (
                <span className="text-xs text-neutral-500">{new Date(c.published_at).toLocaleDateString('en', { dateStyle: 'medium' })}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
