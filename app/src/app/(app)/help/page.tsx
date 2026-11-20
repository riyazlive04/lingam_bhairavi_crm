/**
 * Help Centre: end-user guides for every role, with the signed-in user's guide open by default.
 * Guides are embedded at build time from docs/user-guides (see scripts/embed-guides.mjs).
 * Open to every signed-in user (not mapped in ROUTE_MODULES, so the middleware only checks the login).
 */
import Link from "next/link";
import { BookOpen, ExternalLink, Keyboard, LifeBuoy } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { ROLES } from "@/lib/constants";
import { renderMarkdown } from "@/lib/markdown";
import { GUIDES } from "@/content/guides.generated";
import { Badge, Card, EmptyState, PageHeader, cx } from "@/components/ui";

export const metadata = { title: "Help & Guides" };

const QUICK_START: { title: string; text: string }[] = [
  { title: "Start on the Dashboard", text: "Each morning, read the daily summary that pops up after you sign in. It lists what is due today." },
  { title: "Jump anywhere with Ctrl + K", text: "Press Ctrl + K (or ⌘ K on a Mac) to open any page, or search quotations, customers, items and orders." },
  { title: "Enter work as it happens", text: "Quotes, supplier invoices, deliveries and expenses. Reports can only show what has been entered." },
  { title: "Clear your alerts", text: "Open the bell at the top right, act on each alert, then mark it done or snooze it." },
  { title: "Read your role guide below", text: "It walks through your daily tasks step by step. Switch tabs to see how other teams work." },
];

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ guide?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const mine = GUIDES.find((g) => g.role === user.role) ?? GUIDES[0];
  const current = GUIDES.find((g) => g.slug === sp.guide) ?? mine;
  // The page header already shows the guide title, so drop the Markdown's own top heading.
  const html = current ? renderMarkdown(current.markdown.replace(/^#\s+.+\n+/, "")) : "";

  return (
    <>
      <PageHeader
        eyebrow="Help Centre"
        title="Help & Guides"
        subtitle="Short, practical guides for every role in the team. Your own guide opens first."
        actions={
          <a href="https://sirahdigital.in/" target="_blank" rel="noopener" className="inline-flex h-9.5 items-center gap-1.5 rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink shadow-xs hover:bg-muted">
            <LifeBuoy className="h-4 w-4 text-brand-600" aria-hidden /> Need help? Contact Sirah Digital <ExternalLink className="h-3.5 w-3.5 text-ink-soft" aria-hidden />
          </a>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <nav aria-label="Guides by role" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <ul className="flex w-max gap-1 rounded-xl border border-line bg-surface p-1 shadow-xs">
              {GUIDES.map((g) => {
                const active = g.slug === current?.slug;
                return (
                  <li key={g.slug}>
                    <Link
                      href={`/help?guide=${g.slug}`}
                      scroll={false}
                      aria-current={active ? "page" : undefined}
                      className={cx("flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                        active ? "bg-brand-600 text-white shadow-sm" : "text-ink-soft hover:bg-muted hover:text-ink")}
                    >
                      {g.title}
                      {g.role === user.role && <span className={cx("rounded-full px-1.5 text-[10px] font-semibold uppercase", active ? "bg-white/20" : "bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300")}>You</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {current ? (
            <Card
              icon={BookOpen}
              title={`${current.title} guide`}
              subtitle={current.role ? `For the ${ROLES[current.role]} role` : undefined}
              actions={current.role === user.role ? <Badge tone="green" dot>Your role</Badge> : undefined}
            >
              <article className="prose-app max-w-3xl" dangerouslySetInnerHTML={{ __html: html }} />
            </Card>
          ) : (
            <EmptyState title="No guides yet" icon={BookOpen}>The user guides will appear here once they are published.</EmptyState>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card title="Quick start" subtitle="Five steps for your first week">
            <ol className="space-y-4">
              {QUICK_START.map((s, i) => (
                <li key={s.title} className="flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white" aria-hidden>{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{s.title}</span>
                    <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-soft">{s.text}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
          <Card title="Keyboard shortcuts" icon={Keyboard}>
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3"><dt className="text-ink-soft">Quick search</dt><dd><kbd className="rounded-md border border-line bg-muted px-1.5 py-0.5 text-xs">Ctrl K</kbd></dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-ink-soft">Close a pop-up</dt><dd><kbd className="rounded-md border border-line bg-muted px-1.5 py-0.5 text-xs">Esc</kbd></dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-ink-soft">Move through results</dt><dd><kbd className="rounded-md border border-line bg-muted px-1.5 py-0.5 text-xs">↑ ↓</kbd></dd></div>
            </dl>
          </Card>
          <div className="rounded-2xl border border-line bg-gradient-to-br from-brand-50 to-accent-50 p-5 dark:from-brand-950/50 dark:to-surface">
            <p className="font-semibold text-ink">Still stuck?</p>
            <p className="mt-1 text-sm text-ink-soft">Your system is looked after by Sirah Digital. Reach out and we will help you sort it out.</p>
            <a href="https://sirahdigital.in/" target="_blank" rel="noopener" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
              Need help? Contact Sirah Digital <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </div>
        </aside>
      </div>
    </>
  );
}
