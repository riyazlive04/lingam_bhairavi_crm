/**
 * Rendered markdown or other trusted HTML in the shared reading style (.prose-app in globals.css).
 * Server-safe. Only pass HTML that has been sanitised (renderMarkdown in lib/markdown does this).
 * Maintainer: Sirah Digital.
 */
import { cx } from "../ui";

/**
 * @example <Prose html={renderMarkdown(guide.markdown)} className="max-w-3xl" />            // help guides
 * @example <Prose size="sm" html={renderMarkdown(note.summary)} />                          // inside a card
 */
export function Prose({ html, size = "md", as: Tag = "div", className }: {
  html: string; size?: "sm" | "md"; as?: "div" | "article"; className?: string;
}) {
  return <Tag className={cx("prose-app", size === "sm" && "prose-app-sm", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
