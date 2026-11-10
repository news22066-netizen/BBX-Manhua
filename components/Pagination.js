import Link from 'next/link';

function pagesToShow(page, total) {
  const set = new Set([1, 2, 3, total - 1, total, page - 1, page, page + 1]);
  const nums = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push('gap-' + n);
    out.push(n);
  });
  return out;
}

export default function Pagination({ page, totalPages, hrefFor }) {
  if (totalPages <= 1) return null;

  const base = 'inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-3 text-sm font-medium transition';
  const idle = 'border-neutral-300 hover:bg-black hover:text-white dark:border-neutral-700 dark:hover:bg-white dark:hover:text-black';
  const active = 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black';
  const off = 'pointer-events-none border-neutral-200 text-neutral-400 dark:border-neutral-800 dark:text-neutral-600';

  return (
    <nav aria-label="Pagination" className="mt-10 flex flex-col items-center gap-3">
      <p className="text-xs uppercase tracking-wider text-neutral-500">
        Page {page} of {totalPages}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={`${base} ${idle}`}>« Prev</Link>
        ) : (
          <span className={`${base} ${off}`}>« Prev</span>
        )}

        {pagesToShow(page, totalPages).map((n) =>
          typeof n === 'string' ? (
            <span key={n} className="px-1 text-neutral-500">…</span>
          ) : (
            <Link
              key={n}
              href={hrefFor(n)}
              aria-current={n === page ? 'page' : undefined}
              className={`${base} ${n === page ? active : idle}`}
            >
              {n}
            </Link>
          )
        )}

        {page < totalPages ? (
          <Link href={hrefFor(page + 1)} className={`${base} ${idle}`}>Next »</Link>
        ) : (
          <span className={`${base} ${off}`}>Next »</span>
        )}
      </div>
    </nav>
  );
}
