/**
 * Help centre: end-user guides for every role, with the signed-in user's guide open by default.
 * Guides are embedded at build time from docs/user-guides (see scripts/embed-guides.mjs).
 * Open to every signed-in user (not mapped in ROUTE_MODULES, so the middleware only checks the login).
 */
import { ArrowDown, ArrowUp, BookOpen, ExternalLink, Keyboard, LifeBuoy, Rocket } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { ROLES } from "@/lib/constants";
import { renderMarkdown } from "@/lib/markdown";
import { GUIDES } from "@/content/guides.generated";
import { EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { Callout, SectionCard, StatusPill, SummaryRows, Tabs, type TabItem } from "@/components/patterns";

export const metadata = { title: "Help and guides" };

const QUICK_START: { title: string; text: string }[] = [
  { title: "Start on the dashboard", text: "Each morning, read the daily summary that pops up after you sign in. It lists what is due today." },
  { title: "Jump anywhere with Ctrl K", text: "Press Ctrl K (or ⌘ K on a Mac) to open any page, or search quotations, customers, items and orders." },
  { title: "Enter work as it happens", text: "Quotations, supplier invoices, deliveries and expenses. Reports can only show what has been entered." },
  { title: "Clear your alerts", text: "Open the bell at the top right, act on each alert, then mark it done or snooze it." },
  { title: "Read your role guide", text: "It walks through your daily tasks step by step. Switch tabs to see how other teams work." },
];

const SUPPORT_URL = "https://sirahdigital.in/";
const kbd = "inline-flex items-center gap-1 rounded-md border border-line bg-muted px-1.5 py-0.5 text-caption text-ink";

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ guide?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const mine = GUIDES.find((g) => g.role === user.role) ?? GUIDES[0];
  const current = GUIDES.find((g) => g.slug === sp.guide) ?? mine;
  // The card header already shows the guide title, so drop the Markdown's own top heading.
  const html = current ? renderMarkdown(current.markdown.replace(/^#\s+.+\n+/, "")) : "";

  const tabs: TabItem[] = GUIDES.map((g) => ({
    id: g.slug,
    href: g.slug === mine?.slug ? "/help" : `/help?guide=${g.slug}`,
    label: (
      <>
        {g.title}
        {g.role === user.role && <span className="rounded-full bg-brand-50 px-1.5 text-[10px] font-semibold uppercase text-brand-700 dark:bg-brand-950/60 dark:text-brand-300">You</span>}
      </>
    ),
  }));

  return (
    <>
      <PageHeader
        eyebrow="Help centre"
        title="Help and guides"
        subtitle="Short, practical guides for every role in the team. Your own guide opens first."
        actions={
          <a href={SUPPORT_URL} target="_blank" rel="noopener" className={buttonClass("secondary")}>
            <LifeBuoy className="icon-sm text-brand-600" aria-hidden /> Contact Sirah Digital <ExternalLink className="icon-xs text-ink-soft" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          {GUIDES.length > 1 && current && <Tabs label="Guides by role" items={tabs} active={current.slug} />}

          {current ? (
            <SectionCard
              icon={BookOpen}
              title={`${current.title} guide`}
              description={current.role ? `For the ${ROLES[current.role]} role` : undefined}
              actions={current.role === user.role ? <StatusPill semantic="success" label="Your role" /> : undefined}
            >
              <article className="prose-app max-w-3xl" dangerouslySetInnerHTML={{ __html: html }} />
            </SectionCard>
          ) : (
            <EmptyState title="No guides yet" icon={BookOpen}>The user guides will appear here once they are published.</EmptyState>
          )}
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:self-start" aria-label="Quick help">
          <SectionCard title="Quick start" icon={Rocket} description="Five steps for your first week">
            <ol className="space-y-4">
              {QUICK_START.map((s, i) => (
                <li key={s.title} className="flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 text-caption font-bold text-brand-700 dark:bg-brand-950/60 dark:text-brand-300" aria-hidden>{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{s.title}</span>
                    <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-soft">{s.text}</span>
                  </span>
                </li>
              ))}
            </ol>
          </SectionCard>
          <SectionCard title="Keyboard shortcuts" icon={Keyboard}>
            <SummaryRows rows={[
              ["Quick search", <kbd key="k" className={kbd}>Ctrl K</kbd>],
              ["Close a pop-up", <kbd key="e" className={kbd}>Esc</kbd>],
              ["Move through results", <kbd key="a" className={kbd}><ArrowUp className="icon-xs" aria-label="Up arrow" /><ArrowDown className="icon-xs" aria-label="Down arrow" /></kbd>],
            ]} />
          </SectionCard>
          <Callout tone="info" title="Still stuck?"
            action={
              <a href={SUPPORT_URL} target="_blank" rel="noopener" className={buttonClass("secondary", "sm")}>
                Contact us <ExternalLink className="icon-xs" aria-hidden /><span className="sr-only">(opens in a new tab)</span>
              </a>
            }>
            Your system is looked after by Sirah Digital. Get in touch and we will help you sort it out.
          </Callout>
        </aside>
      </div>
    </>
  );
}
