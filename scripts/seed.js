/**
 * AniList-first seeder. Seeds Supabase with metadata ONLY (no images are downloaded).
 * Run:  npm run seed     (Node 20.6+, reads .env.local)
 *
 * Pipeline (top-down):
 *   1. AniList  -> the catalog. Top TARGET_COUNT most popular Chinese-origin manga (type MANGA,
 *                  countryOfOrigin CN), with title, description, cover, genres, score, status.
 *                  Every row gets an AniList cover, so no image is missing.
 *   2. MangaDex -> title search bridge. Each AniList title is searched on MangaDex and the matching
 *                  record's UUID is taken (it becomes `source_id`).
 *   3. MangaDex -> /manga/{id}/feed, English chapters only, de-duplicated in memory with a Map keyed
 *                  by chapter_number so the (manhua_id, chapter_number) unique constraint never fires.
 *   4. Supabase -> upsert into `manhuas` and `chapters`, one title at a time (an interrupted run
 *                  keeps everything saved so far; just run it again).
 *
 * English only: a title is kept only if AniList has an English title (no CJK characters), it is found
 * on MangaDex, and it has at least one readable English chapter. Everything else is skipped, and the
 * script keeps walking down AniList's popularity list until TARGET_COUNT titles are saved.
 * Origin defaults to CN (manhua); override with e.g.  ORIGIN=KR npm run seed
 *
 * Pacing: MangaDex calls sleep 250 ms after every success; HTTP 429 on either API is retried
 * honoring Retry-After. AniList calls are paced at ANILIST_DELAY_MS (default 2200 ms).
 */
const { createClient } = require('@supabase/supabase-js');

const MANGADEX_API = 'https://api.mangadex.org';
const ANILIST_API = 'https://graphql.anilist.co'; // the API host (anilist.co itself is the website)
const UA = 'ManhuaReaderSeed/2.0 (personal project)';

const TARGET_COUNT = Number(process.env.TARGET_COUNT) || 200; // titles to SAVE (English + readable)
const MAX_PAGES = 30; // safety cap: at most 30 x 50 = 1500 AniList candidates scanned
const ORIGIN = (process.env.ORIGIN || 'CN').toUpperCase(); // AniList countryOfOrigin
const ORIGIN_LANGS = { CN: ['zh', 'zh-hk'], KR: ['ko'], JP: ['ja'], TW: ['zh-hk', 'zh'] }[ORIGIN] || ['zh', 'zh-hk'];
// Hiragana/Katakana, CJK ideographs, Hangul: never allowed in anything we store as English text.
const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;
const ANILIST_PER_PAGE = 50; // AniList's hard maximum per page
const MANGADEX_DELAY_MS = 250;
const ANILIST_DELAY_MS = Number(process.env.ANILIST_DELAY_MS) || 2200;
const CHAPTER_PAGE = 500; // MangaDex /feed max page size

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/** Lowercase, accent-free, punctuation-free form used to compare titles. */
const norm = (s) =>
  String(s ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');

/** Seconds to wait after a 429, from Retry-After (or MangaDex's X-RateLimit-Retry-After epoch). */
function retryDelayMs(res, attempt) {
  const retryAfter = Number(res.headers.get('retry-after'));
  if (retryAfter > 0) return retryAfter * 1000;
  const resetEpoch = Number(res.headers.get('x-ratelimit-retry-after'));
  if (resetEpoch > 0) return Math.max(1000, resetEpoch * 1000 - Date.now());
  return 2000 * attempt;
}

/* ------------------------------------------------------------------------- */
/* 1. AniList: primary catalog                                               */
/* ------------------------------------------------------------------------- */

const ANILIST_QUERY = `
  query ($page: Int, $perPage: Int, $country: CountryCode) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage }
      media(
        type: MANGA
        countryOfOrigin: $country
        format_not_in: [NOVEL]
        sort: POPULARITY_DESC
      ) {
        id
        title { english romaji }
        synonyms
        description(asHtml: false)
        coverImage { extraLarge large }
        genres
        averageScore
        popularity
        status
      }
    }
  }
`;

/** POST to AniList's GraphQL endpoint with 429 / 5xx / network retry and polite pacing. */
async function anilist(variables) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    let res;
    try {
      res = await fetch(ANILIST_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA },
        body: JSON.stringify({ query: ANILIST_QUERY, variables }),
      });
    } catch (e) {
      console.warn(`  AniList network error (${e.message}); retrying...`);
      await sleep(1000 * attempt);
      continue;
    }

    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after')) || 60;
      console.warn(`  AniList rate limit hit; waiting ${wait}s before retrying...`);
      await sleep(wait * 1000);
      continue;
    }
    if (res.status >= 500) {
      console.warn(`  AniList HTTP ${res.status}; retrying...`);
      await sleep(2000 * attempt);
      continue;
    }

    await sleep(ANILIST_DELAY_MS);
    const json = await res.json().catch(() => null);
    if (!res.ok || !json || (Array.isArray(json.errors) && json.errors.length)) {
      throw new Error(`AniList HTTP ${res.status}: ${json?.errors?.[0]?.message || 'no/invalid JSON body'}`);
    }
    return json;
  }
  throw new Error('AniList: gave up after 5 attempts');
}

/** AniList descriptions contain light HTML (<br>, <i>, ...) even with asHtml:false on some entries. */
function cleanDescription(text) {
  if (!text) return null;
  const cleaned = String(text)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned || null;
}

// AniList status -> the lowercase values MangaDex used (what the existing rows contain).
const STATUS_MAP = {
  RELEASING: 'ongoing',
  NOT_YET_RELEASED: 'ongoing',
  FINISHED: 'completed',
  CANCELLED: 'cancelled',
  HIATUS: 'hiatus',
};

/** One page (50) of AniList candidates, already filtered to English-titled entries with a cover. */
async function fetchAniListPage(page) {
  const json = await anilist({ page, perPage: ANILIST_PER_PAGE, country: ORIGIN });
  const media = json.data?.Page?.media ?? [];
  const items = [];
  let noEnglish = 0;
  for (const m of media) {
    const english = m.title?.english?.trim();
    const cover = m.coverImage?.extraLarge || m.coverImage?.large || null;
    // English title only: romaji (pinyin) and CJK titles are not English names.
    if (!english || CJK_RE.test(english) || !cover) {
      noEnglish++;
      continue;
    }
    const description = cleanDescription(m.description);
    items.push({
      anilistId: m.id,
      title: english,
      english,
      romaji: m.title?.romaji?.trim() || null, // only used as an extra MangaDex search term
      synonyms: (m.synonyms || []).filter((t) => t && !CJK_RE.test(t)),
      description: description && !CJK_RE.test(description) ? description : null,
      cover_url: cover,
      genres: m.genres || [],
      // AniList averageScore is 0-100; the table's `rating` is 0-10.
      rating: m.averageScore != null ? Number((m.averageScore / 10).toFixed(1)) : null,
      popularity: m.popularity ?? 0,
      status: STATUS_MAP[m.status] || null,
    });
  }
  console.log(`  AniList page ${page}: ${media.length} fetched, ${noEnglish} skipped (no English title/cover)`);
  return { items, hasNext: Boolean(json.data?.Page?.pageInfo?.hasNextPage) && media.length > 0 };
}

/* ------------------------------------------------------------------------- */
/* 2. MangaDex: title search bridge                                          */
/* ------------------------------------------------------------------------- */

/** GET with repeated query keys, 250 ms pacing and 429 retry. */
async function md(path, pairs = []) {
  const u = new URL(MANGADEX_API + path);
  for (const [k, v] of pairs) u.searchParams.append(k, v);
  for (let attempt = 1; attempt <= 5; attempt++) {
    let res;
    try {
      res = await fetch(u, { headers: { 'User-Agent': UA } });
    } catch (e) {
      await sleep(1000 * attempt);
      continue;
    }
    if (res.status === 429) {
      const wait = retryDelayMs(res, attempt);
      console.warn(`  MangaDex rate limit hit; waiting ${Math.ceil(wait / 1000)}s...`);
      await sleep(wait);
      continue;
    }
    if (res.status >= 500) {
      await sleep(2000 * attempt);
      continue;
    }
    if (!res.ok) throw new Error(`MangaDex ${res.status} for ${u}`);
    await sleep(MANGADEX_DELAY_MS);
    return res.json();
  }
  throw new Error(`MangaDex rate-limited / unavailable too long: ${u}`);
}

/** Every title string MangaDex knows for a record (main title + all alt titles, any language). */
function mangadexNames(attributes) {
  const names = [];
  for (const v of Object.values(attributes.title || {})) names.push(v);
  for (const alt of attributes.altTitles || []) for (const v of Object.values(alt)) names.push(v);
  return names.filter((n) => typeof n === 'string' && n.trim());
}

/**
 * Searches MangaDex for one AniList item and returns the matching manga UUID (or null).
 * Tries the English title, then romaji, then a couple of synonyms. A hit is a MangaDex record
 * whose title/alt titles equal one of the AniList names once normalized; if none is exact, a
 * containment match (the shorter name at least 8 chars) is accepted. Never blindly takes result #1,
 * because a wrong match would attach another series' chapters.
 */
async function findOnMangaDex(item) {
  const names = [...new Set([item.english, item.romaji, ...item.synonyms.slice(0, 2)].filter(Boolean))];
  const wanted = new Set(names.map(norm).filter(Boolean));

  for (const name of names) {
    const json = await md('/manga', [
      ['title', name], // percent-encoded automatically (same result as encodeURIComponent)
      ['limit', '10'],
      ...ORIGIN_LANGS.map((l) => ['originalLanguage[]', l]),
      ['availableTranslatedLanguage[]', 'en'],
      ['contentRating[]', 'safe'],
      ['contentRating[]', 'suggestive'],
      ['order[relevance]', 'desc'],
    ]).catch((e) => {
      console.warn(`  MangaDex search failed for "${name}": ${e.message}`);
      return null;
    });
    const results = json?.data ?? [];
    if (!results.length) continue;

    const exact = results.find((m) => mangadexNames(m.attributes).some((n) => wanted.has(norm(n))));
    if (exact) return exact.id;

    const loose = results.find((m) =>
      mangadexNames(m.attributes).some((n) => {
        const a = norm(n);
        return [...wanted].some((w) => a && w && Math.min(a.length, w.length) >= 8 && (a.includes(w) || w.includes(a)));
      })
    );
    if (loose) return loose.id;
  }
  return null;
}

/* ------------------------------------------------------------------------- */
/* 3. MangaDex: de-duplicated chapter sync                                   */
/* ------------------------------------------------------------------------- */

/** All readable English chapters for one manga, de-duplicated by chapter number via a Map. */
async function fetchChapters(mangadexId) {
  const byNumber = new Map(); // chapter_number -> row (first one wins)
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const json = await md(`/manga/${mangadexId}/feed`, [
      ['translatedLanguage[]', 'en'],
      ['order[chapter]', 'desc'],
      ['limit', String(CHAPTER_PAGE)],
      ['offset', String(offset)],
      ['includeExternalUrl', '0'],
      ['contentRating[]', 'safe'],
      ['contentRating[]', 'suggestive'],
    ]);
    total = json.total;
    offset += CHAPTER_PAGE;
    for (const c of json.data) {
      const a = c.attributes;
      const n = a.chapter == null ? NaN : Number(a.chapter);
      if (Number.isNaN(n) || !a.pages || a.externalUrl) continue; // unreadable or unnumbered
      if (!byNumber.has(n)) {
        byNumber.set(n, {
          chapter_number: n,
          title: a.title || null,
          source_chapter_id: c.id,
          published_at: a.publishAt || null,
        });
      }
    }
  }
  return [...byNumber.values()];
}

/* ------------------------------------------------------------------------- */
/* 4. Supabase upsert                                                        */
/* ------------------------------------------------------------------------- */

async function saveItem(item, sourceId, chapters) {
  const row = {
    source_id: sourceId,
    title: item.title,
    description: item.description,
    cover_url: item.cover_url,
    rating: item.rating,
    follows: item.popularity, // AniList popularity drives the "popular" sort
    genres: item.genres,
    status: item.status,
  };

  const { data, error } = await supabase
    .from('manhuas')
    .upsert(row, { onConflict: 'source_id' })
    .select('id')
    .single();
  if (error) throw error;

  const chapterRows = chapters.map((c) => ({ ...c, manhua_id: data.id }));
  for (const part of chunk(chapterRows, 500)) {
    const { error: chErr } = await supabase.from('chapters').upsert(part, { onConflict: 'manhua_id,chapter_number' });
    if (chErr) throw chErr;
  }
  return chapterRows.length;
}

/* ------------------------------------------------------------------------- */

async function main() {
  console.log(`\n=== English ${ORIGIN} catalog: AniList popularity -> MangaDex -> Supabase (target ${TARGET_COUNT}) ===`);
  const seenAniList = new Set();
  const seenSourceIds = new Set(); // two AniList entries must never resolve to the same MangaDex row
  const stats = { saved: 0, notOnMangaDex: 0, noEnglishChapters: 0, duplicates: 0, failed: 0, chapters: 0 };

  for (let page = 1; page <= MAX_PAGES && stats.saved < TARGET_COUNT; page++) {
    const { items, hasNext } = await fetchAniListPage(page);

    for (const item of items) {
      if (stats.saved >= TARGET_COUNT) break;
      if (seenAniList.has(item.anilistId)) continue;
      seenAniList.add(item.anilistId);
      const tag = `"${item.title}"`;

      try {
        const mangadexId = await findOnMangaDex(item);
        if (!mangadexId) {
          stats.notOnMangaDex++;
          console.log(`  skip ${tag}: not found on MangaDex (English)`);
          continue;
        }
        if (seenSourceIds.has(mangadexId)) {
          stats.duplicates++;
          console.log(`  skip ${tag}: MangaDex record already used by another AniList entry`);
          continue;
        }
        const chapters = await fetchChapters(mangadexId);
        if (!chapters.length) {
          stats.noEnglishChapters++;
          console.log(`  skip ${tag}: no readable English chapters`);
          continue;
        }
        seenSourceIds.add(mangadexId);
        const saved = await saveItem(item, mangadexId, chapters);
        stats.saved++;
        stats.chapters += saved;
        console.log(`  [${stats.saved}/${TARGET_COUNT}] ${tag}: ${saved} chapters (${mangadexId})`);
      } catch (e) {
        stats.failed++;
        console.error(`  ${tag}: FAILED - ${e.message || JSON.stringify(e)}`);
      }
    }
    if (!hasNext) break;
  }

  console.log(
    `\nDone. ${stats.saved}/${TARGET_COUNT} English titles saved with ${stats.chapters} chapters. ` +
      `Skipped: ${stats.notOnMangaDex} not on MangaDex, ${stats.noEnglishChapters} without English chapters, ` +
      `${stats.duplicates} duplicates. ${stats.failed} failed.`
  );
  if (stats.saved < TARGET_COUNT) {
    console.warn(`Only ${stats.saved} qualifying titles found within ${MAX_PAGES} AniList pages.`);
  }
  if (stats.failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});