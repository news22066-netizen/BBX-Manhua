/**
 * Image proxy: /api/proxy?url=<encoded remote image url>
 *
 * - Edge runtime: streams the body (no buffering), cheap on Vercel's free tier.
 * - Sends browser-like request headers, Referer inferred from the current hop's origin.
 * - Aggressive immutable caching so Cloudflare / Vercel CDN serve repeat hits.
 * - Host allowlist: without it this would be an open proxy / SSRF hole.
 *   Only add hosts you are entitled to fetch from.
 * - Redirects are followed MANUALLY, one hop at a time. Every hop (the original URL and
 *   each Location target) must pass the same HTTPS / no-credentials / allowlist checks,
 *   so a redirect can never lead the proxy to an untrusted host.
 *
 * Allowed upstreams:
 *   - uploads.mangadex.org / api.mangadex.org   MangaDex (fallback covers; only image/* is streamed back)
 *   - *.mangadex.network                        MangaDex@Home nodes that serve chapter page images
 *                                               (the reader page needs these, so they must stay allowed)
 *   - *.anilist.co                              AniList's cover CDN (s4.anilist.co and its siblings)
 */
export const runtime = 'edge';

// Exact hostnames (compared case-insensitively).
const ALLOWED_HOSTS = ['api.mangadex.org', 'uploads.mangadex.org'];

// Suffix matches: rotating MangaDex@Home node hostnames (chapter reader) and AniList's cover CDN (s4.anilist.co).
const ALLOWED_HOST_SUFFIXES = ['.mangadex.network', '.anilist.co'];

// Maximum number of redirect hops we are willing to follow (prevents redirect loops).
const MAX_REDIRECTS = 5;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const IMMUTABLE = 'public, max-age=31536000, s-maxage=31536000, immutable';
const NO_STORE = { 'Cache-Control': 'no-store' };

function isAllowedHost(hostname) {
  const host = hostname.toLowerCase();
  return ALLOWED_HOSTS.includes(host) || ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/** HTTPS only, no embedded credentials, allowlisted host only. */
function isAllowedTarget(url) {
  return url.protocol === 'https:' && !url.username && !url.password && isAllowedHost(url.hostname);
}

export async function GET(request) {
  const raw = new URL(request.url).searchParams.get('url');
  if (!raw) return new Response('Missing "url" parameter', { status: 400 });

  let target;
  try {
    target = new URL(raw);
  } catch {
    return new Response('Invalid url', { status: 400 });
  }

  // Security host validation for the initial URL.
  if (!isAllowedTarget(target)) {
    return new Response('Host not allowed', { status: 403 });
  }

  let upstream;

  // Follow redirects manually: the initial request plus up to MAX_REDIRECTS hops.
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    try {
      upstream = await fetch(target.toString(), {
        // Modern browser User-Agent + Referer that matches the current hop's domain.
        headers: { ...BROWSER_HEADERS, Referer: `${target.origin}/` },
        // 'manual' (not 'error') keeps the Vercel Edge runtime happy and lets us
        // inspect and validate every redirect before following it.
        redirect: 'manual',
      });
    } catch {
      return new Response('Upstream unreachable', { status: 502, headers: NO_STORE });
    }

    if (!REDIRECT_STATUSES.has(upstream.status)) break; // final response reached

    // Discard the redirect response body so the connection can be released.
    try {
      await upstream.body?.cancel();
    } catch {
      /* ignore */
    }

    if (hop === MAX_REDIRECTS) {
      return new Response('Too many redirects', { status: 508, headers: NO_STORE });
    }

    const location = upstream.headers.get('location');
    if (!location) {
      return new Response('Upstream redirect without Location', { status: 502, headers: NO_STORE });
    }

    // Location may be relative; resolve it against the URL we just requested.
    let next;
    try {
      next = new URL(location, target);
    } catch {
      return new Response('Invalid redirect target', { status: 502, headers: NO_STORE });
    }

    // The redirect destination must pass the exact same security rules.
    if (!isAllowedTarget(next)) {
      return new Response('Redirect target not allowed', { status: 403, headers: NO_STORE });
    }

    target = next;
  }

  // Never let errors get cached as "immutable".
  if (!upstream.ok || !upstream.body) {
    return new Response(`Upstream error ${upstream.status}`, {
      status: upstream.status === 404 ? 404 : 502,
      headers: NO_STORE,
    });
  }

  const type = upstream.headers.get('content-type') || '';
  if (!type.startsWith('image/')) {
    return new Response('Not an image', { status: 415, headers: NO_STORE });
  }

  const headers = new Headers({
    'Content-Type': type,
    'Cache-Control': IMMUTABLE,
    'X-Content-Type-Options': 'nosniff',
    // CORS headers: cross-origin sharing access for browser canvas loading compatibility.
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  });
  const len = upstream.headers.get('content-length');
  if (len) headers.set('Content-Length', len);

  return new Response(upstream.body, { status: 200, headers });
}