/** Loading skeletons shown by loading.tsx files while a page's data streams in. */
import { Skeleton } from "./ui";

function Header() {
  return (
    <div className="mb-6 space-y-2">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  );
}

function Tiles({ n = 4 }: { n?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="mt-3 h-7 w-28" />
          <Skeleton className="mt-3 h-3 w-36" />
        </div>
      ))}
    </div>
  );
}

function TableBlock({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      <div className="border-b border-line bg-muted px-4 py-3"><Skeleton className="h-3 w-1/3" /></div>
      <div className="divide-y divide-line">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="hidden h-4 w-24 sm:block" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Generic list page: header, filter bar, table. */
export function ListSkeleton({ tiles = 0 }: { tiles?: number }) {
  return (
    <div role="status" aria-live="polite" aria-label="Loading">
      <span className="sr-only">Loading…</span>
      <Header />
      {tiles > 0 && <div className="mb-4"><Tiles n={tiles} /></div>}
      <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-line bg-surface p-2 sm:flex-row">
        <Skeleton className="h-9.5 sm:w-72" />
        <Skeleton className="h-9.5 sm:w-40" />
        <Skeleton className="h-9.5 sm:w-24" />
      </div>
      <TableBlock />
    </div>
  );
}

/** Dashboard: hero, KPI tiles, two cards. */
export function DashboardSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading">
      <span className="sr-only">Loading your dashboard…</span>
      <div className="mb-6 rounded-3xl bg-gradient-to-br from-brand-600/80 to-brand-800/80 px-6 py-8">
        <div className="h-3 w-40 rounded bg-white/25" />
        <div className="mt-3 h-8 w-64 max-w-full rounded bg-white/30" />
        <div className="mt-3 h-4 w-80 max-w-full rounded bg-white/20" />
      </div>
      <Tiles n={8} />
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <TableBlock rows={5} />
        <TableBlock rows={5} />
      </div>
    </div>
  );
}

/** Detail page: back link, title row with actions, meta chips, main column plus sidebar. */
export function DetailSkeleton({ aside = true }: { aside?: boolean }) {
  return (
    <div role="status" aria-live="polite" aria-label="Loading">
      <span className="sr-only">Loading…</span>
      <Skeleton className="mb-4 h-4 w-24" />
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2"><Skeleton className="h-3 w-28" /><Skeleton className="h-8 w-64 max-w-full" /></div>
        <div className="hidden gap-2 sm:flex"><Skeleton className="h-9.5 w-32" /><Skeleton className="h-9.5 w-36" /></div>
      </div>
      <div className="mb-5 flex flex-wrap gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-7 w-36" />)}</div>
      <div className="mb-4 flex gap-4 border-b border-line pb-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-5 w-20" />)}</div>
      <div className={aside ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]" : ""}>
        <TableBlock rows={6} />
        {aside && (
          <div className="space-y-4">
            {[0, 1].map((i) => (
              <div key={i} className="space-y-3 rounded-2xl border border-line bg-surface p-5 shadow-sm">
                <Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-4/5" /><Skeleton className="h-3 w-3/5" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Form page: header and two titled sections. */
export function FormSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading" className="max-w-4xl">
      <span className="sr-only">Loading…</span>
      <Header />
      {[0, 1].map((s) => (
        <div key={s} className="mb-4 rounded-2xl border border-line bg-surface shadow-sm">
          <div className="border-b border-line px-5 py-3"><Skeleton className="h-4 w-40" /></div>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => <div key={i} className="space-y-2"><Skeleton className="h-3.5 w-24" /><Skeleton className="h-9.5 w-full" /></div>)}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Printable document: toolbar and an A4 sheet. */
export function DocumentSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading" className="mx-auto max-w-[210mm]">
      <span className="sr-only">Loading…</span>
      <div className="mb-4 flex justify-between"><Skeleton className="h-5 w-32" /><Skeleton className="h-9.5 w-40" /></div>
      <div className="space-y-4 rounded-2xl border border-line bg-surface p-8 shadow-md">
        <div className="flex justify-between"><div className="space-y-2"><Skeleton className="h-6 w-56" /><Skeleton className="h-3 w-64" /></div><Skeleton className="h-6 w-32" /></div>
        <Skeleton className="h-24 w-full" /><Skeleton className="h-48 w-full" /><Skeleton className="ml-auto h-20 w-64" />
      </div>
    </div>
  );
}
