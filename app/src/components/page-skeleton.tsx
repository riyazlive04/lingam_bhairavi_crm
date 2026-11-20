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
