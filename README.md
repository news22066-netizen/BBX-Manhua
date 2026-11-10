# Manhua Reader (Next.js + Supabase + Cloudflare)

## Setup
1. `npm install`
2. Supabase → SQL Editor → run `supabase/schema.sql`
3. `cp .env.example .env.local` and fill in the keys
4. `npm run seed` (Node 20.6+; takes a few minutes because it respects MangaDex rate limits)
5. `npm run dev`
6. Deploy to Vercel. Add only the two `NEXT_PUBLIC_*` vars there. Never add the service-role key.

## Folder structure
```
app/
  layout.js                      theme script, font, header
  globals.css
  page.js                        redirects to /home
  home/page.js                   30 per page grid + search + genres + pagination
  api/proxy/route.js             edge image proxy (allowlist + immutable cache)
  manhua/[id]/page.js            title page + chapter list
  manhua/[id]/[chapter]/page.js  vertical-strip reader
components/  ThemeToggle, Header, GenreFilter, ManhuaCard
lib/         supabase.js, proxy.js
scripts/seed.js
supabase/schema.sql
```

## Cloudflare (so the proxy costs you ~0 Vercel bandwidth)
1. Put your custom domain on Cloudflare with the DNS record proxied (orange cloud) pointing at Vercel. Use SSL mode "Full (strict)".
2. Rules → Cache Rules → new rule: `URI Path starts with /api/proxy`
   → Eligible for cache, Edge TTL "Use cache-control header if present", Browser TTL "Respect origin".
3. Query strings are part of the cache key by default, which is what we want (each image URL is its own key).

## Things worth knowing
- Cache hit rate: MangaDex page URLs contain the at-home node hostname, which can differ per request,
  so chapter pages are cached per node URL. Covers have stable URLs and cache perfectly.
- Only chapters hosted on MangaDex are readable. Chapters that just link to an external site
  (official/licensed releases) are skipped by the seed script.
- MangaDex rules: personal/non-commercial use, credit scanlation groups, no ad monetisation of their
  content. Vercel Hobby is also non-commercial only.
- Proxy allowlist: only add hosts you have the right to fetch from.
