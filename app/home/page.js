import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getGenres } from '@/lib/genres';
import GenreFilter from '@/components/GenreFilter';
import SearchBar from '@/components/SearchBar';
import ManhuaCard from '@/components/ManhuaCard';
import Pagination from '@/components/Pagination';

const PAGE_SIZE = 30;

// Always read fresh data: newly added manhua are instantly searchable / filterable.
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Manhua Reader' };

export default async function Home({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const selected = (sp.genre ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const q = String(sp.q ?? '').trim().slice(0, 100);
  const page = Math.max(1, parseInt(sp.page, 10) || 1);

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('manhuas')
    .select('id, title, cover_url, rating, genres, chapters(chapter_number, published_at)', { count: 'exact' })
    .order('follows', { ascending: false })
    .order('id', { ascending: true }) // tie-breaker so pages never overlap or skip
    .range(from, to) // only 30 rows leave the database per page
    .order('chapter_number', { referencedTable: 'chapters', ascending: false })
    .limit(3, { referencedTable: 'chapters' });

  if (selected.length) query = query.contains('genres', selected);
  if (q) {
    // searches the whole table, escaping LIKE wildcards typed by the user
    const safe = q.replace(/[\\%_]/g, (c) => '\\' + c);
    query = query.ilike('title', `%${safe}%`);
  }

  const [res, genres] = await Promise.all([query, getGenres()]);
  const manhuas = res.data ?? [];
  const total = res.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hrefFor = (n) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (selected.length) p.set('genre', selected.join(','));
    if (n > 1) p.set('page', String(n));
    const qs = p.toString();
    return qs ? `/home?${qs}` : '/home';
  };

  // Page number beyond the end (e.g. after a search) -> jump to the last real page.
  if (!res.error && total > 0 && page > totalPages) redirect(hrefFor(totalPages));

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <SearchBar q={q} genre={selected.join(',')} />

      <div className="mt-4">
        <GenreFilter key={selected.join(',')} genres={genres} selected={selected} q={q} />
      </div>

      <div className="mb-4 mt-8 flex items-baseline justify-between border-b border-neutral-200 pb-2 dark:border-neutral-800">
        <h1 className="text-sm font-bold uppercase tracking-wide">
          {q ? `Results for “${q}”` : 'Latest updates'}
        </h1>
        <span className="text-xs text-neutral-500">{total} titles</span>
      </div>

      {res.error && <p className="text-sm text-red-500">Could not load titles: {res.error.message}</p>}
      {!res.error && manhuas.length === 0 && (
        <p className="py-16 text-center text-neutral-500">No titles match your search criteria.</p>
      )}

      <div className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-4 md:gap-x-4 lg:grid-cols-6">
        {manhuas.map((m) => (
          <ManhuaCard key={m.id} m={m} />
        ))}
      </div>

      <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
    </main>
  );
}
