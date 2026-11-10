import { unstable_cache } from 'next/cache';
import { supabase } from '@/lib/supabase';

// Distinct genres across the WHOLE table (not just the first page).
// Prefers the `get_genres()` SQL function (fast); falls back to paging through
// the genres column 1000 rows at a time (Supabase's default max per request).
async function loadGenres() {
  const rpc = await supabase.rpc('get_genres');
  if (!rpc.error && Array.isArray(rpc.data)) {
    return rpc.data.map((r) => (typeof r === 'string' ? r : r.genre ?? r.get_genres)).filter(Boolean).sort();
  }

  const set = new Set();
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase
      .from('manhuas')
      .select('genres')
      .order('id')
      .range(from, from + size - 1);
    if (error || !data?.length) break;
    data.forEach((r) => (r.genres ?? []).forEach((g) => set.add(g)));
    if (data.length < size) break;
  }
  return [...set].sort();
}

// Refreshes every 60s, so new genres from newly added manhua show up quickly.
export const getGenres = unstable_cache(loadGenres, ['all-genres'], { revalidate: 60 });
