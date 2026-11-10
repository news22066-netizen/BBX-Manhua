// Plain GET form: works without client JS and always searches the whole database.
export default function SearchBar({ q, genre }) {
  return (
    <form action="/home" method="get" role="search" className="flex w-full gap-2">
      {genre ? <input type="hidden" name="genre" value={genre} /> : null}
      <input
        type="search"
        name="q"
        defaultValue={q}
        maxLength={100}
        placeholder="Search manhua by title…"
        aria-label="Search manhua by title"
        className="w-full rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm text-black placeholder-neutral-500 focus:border-black focus:outline-none dark:border-neutral-700 dark:bg-black dark:text-white dark:focus:border-white"
      />
      <button
        type="submit"
        className="rounded-md bg-black px-5 py-2 text-sm font-semibold text-white hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-300"
      >
        Search
      </button>
    </form>
  );
}
