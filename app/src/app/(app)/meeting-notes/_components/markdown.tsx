import { renderMarkdown } from "@/lib/markdown";
import { cx } from "@/components/ui";

const PROSE = cx(
  "text-sm leading-relaxed text-ink break-words",
  "[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-semibold",
  "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold",
  "[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-base [&_h3]:font-semibold",
  "[&_h4]:mt-3 [&_h4]:font-semibold",
  "[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
  "[&_a]:text-brand-700 [&_a]:underline dark:[&_a]:text-brand-300",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-4 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-ink-soft",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:text-[0.85em]",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_table]:my-2 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse",
  "[&_th]:border [&_th]:border-line [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_th]:text-left",
  "[&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1 [&_td]:align-top",
  "[&_hr]:my-4 [&_hr]:border-line [&_input]:mr-1.5 [&_input]:align-middle",
);

/** Renders sanitised markdown (see lib/markdown allowlist). */
export function Markdown({ md, empty = "Nothing recorded.", className }: { md: string | null | undefined; empty?: string; className?: string }) {
  const html = renderMarkdown(md);
  if (!html) return <p className="text-sm text-ink-faint">{empty}</p>;
  return <div className={cx(PROSE, className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
