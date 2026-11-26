import { renderMarkdown } from "@/lib/markdown";
import { Prose } from "@/components/patterns";

/** Renders sanitised markdown (see lib/markdown allowlist) in the shared compact prose style. */
export function Markdown({ md, empty = "Nothing recorded.", className }: { md: string | null | undefined; empty?: string; className?: string }) {
  const html = renderMarkdown(md);
  if (!html) return <p className="text-sm text-ink-faint">{empty}</p>;
  return <Prose size="sm" html={html} className={className} />;
}
