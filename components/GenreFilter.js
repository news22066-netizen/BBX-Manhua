'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function GenreFilter({ genres, selected, q = '' }) {
  const router = useRouter();
  const [open, setOpen] = useState(selected.length > 0);
  const [picked, setPicked] = useState(selected);
  const [pending, start] = useTransition();

  const toggle = (g) =>
    setPicked((p) => (p.includes(g) ? p.filter((x) => x !== g) : [...p, g]));

  const go = (list) =>
    start(() => {
      const sp = new URLSearchParams();
      if (q) sp.set('q', q);
      if (list.length) sp.set('genre', list.join(','));
      const qs = sp.toString();
      router.push(qs ? `/home?${qs}` : '/home');
    });

  return (
    <section className="rounded-lg border border-neutral-200 dark:border-neutral-800">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="genre-panel"
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold"
      >
        <span>
          Genres &amp; tags
          {selected.length > 0 && (
            <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-fg">
              {selected.length}
            </span>
          )}
        </span>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div id="genre-panel" className="border-t border-neutral-200 p-4 dark:border-neutral-800">
          <div className="flex flex-wrap gap-2">
            {genres.map((g) => {
              const on = picked.includes(g);
              return (
                <button
                  key={g}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(g)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    on
                      ? 'border-accent bg-accent text-accent-fg'
                      : 'border-neutral-300 hover:border-accent dark:border-neutral-700'
                  }`}
                >
                  {g}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => go(picked)}
              disabled={pending}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-bright disabled:opacity-60"
            >
              {pending ? 'Searching…' : 'Show results'}
            </button>
            <button
              type="button"
              onClick={() => { setPicked([]); go([]); }}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:border-accent dark:border-neutral-700"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
