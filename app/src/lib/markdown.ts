/**
 * Markdown → sanitised HTML (allowlist). Maintainer: Sirah Digital.
 * Every user-supplied markdown must go through renderMarkdown() before dangerouslySetInnerHTML.
 */
import "server-only";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr", "blockquote", "pre", "code",
  "ul", "ol", "li", "strong", "em", "del", "s", "a", "table", "thead", "tbody", "tr", "th", "td", "input", "span",
];

const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ["href", "title", "rel", "target"],
    th: ["align"],
    td: ["align"],
    code: ["class"],
    ol: ["start"],
    // GFM task list checkboxes (rendered disabled by marked)
    input: ["type", "checked", "disabled"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  exclusiveFilter: (frame) => frame.tag === "input" && frame.attribs.type !== "checkbox",
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow", target: "_blank" }),
    input: (tagName, attribs) => ({ tagName, attribs: { ...attribs, disabled: "" } }),
  },
};

/** Render markdown to safe HTML. Raw HTML in the source is stripped by the allowlist. */
export function renderMarkdown(md: string | null | undefined): string {
  if (!md || !md.trim()) return "";
  const html = marked.parse(md, { async: false, gfm: true, breaks: true });
  return sanitizeHtml(html, SANITIZE);
}

export type MeetingNoteForExport = {
  title: string;
  meetingDate: string;
  attendees: string | null;
  summary: string | null;
  decisions: string | null;
  actionItems: { text: string; owner: string; due?: string; done: boolean }[];
  openQuestions: string | null;
  transcript: string | null;
  version: number;
  updatedAt: Date | string;
  createdAt: Date | string;
};

/** A revision row stores the snapshot of `version`; its changeSummary describes the edit that produced version+1. */
export type MeetingRevisionForExport = { version: number; changeSummary: string | null; createdAt: Date | string; by: string | null };

/** Serialise a meeting note to a Markdown document following docs/meetings conventions. */
export function meetingNoteToMarkdown(n: MeetingNoteForExport, revisions: MeetingRevisionForExport[] = []): string {
  const iso = (d: Date | string) => (typeof d === "string" ? d : d.toISOString()).slice(0, 10);
  const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const out: string[] = [];
  out.push(`# ${n.title}`, "");
  out.push("| Field | Value |", "|---|---|");
  out.push(`| **Date** | ${n.meetingDate} |`);
  out.push(`| **Attendees** | ${esc(n.attendees || "-")} |`);
  out.push(`| **Version** | v${n.version} (updated ${iso(n.updatedAt)}) |`, "");
  out.push("## 1. Summary", "", n.summary?.trim() || "_None recorded._", "");
  out.push("## 2. Decisions", "", n.decisions?.trim() || "_None recorded._", "");
  out.push("## 3. Action items", "");
  if (n.actionItems.length) {
    out.push("| # | Action | Owner | Due | Status |", "|---|---|---|---|---|");
    n.actionItems.forEach((a, i) => {
      out.push(`| A-${String(i + 1).padStart(2, "0")} | ${esc(a.text)} | ${esc(a.owner || "-")} | ${a.due || "-"} | ${a.done ? "Done" : "Open"} |`);
    });
  } else out.push("_No action items._");
  out.push("");
  out.push("## 4. Open questions", "", n.openQuestions?.trim() || "_None._", "");
  out.push("## 5. Change log / revision history", "");
  out.push("| Version | Date | By | Change |", "|---|---|---|---|");
  const sorted = [...revisions].sort((a, b) => b.version - a.version);
  for (const r of sorted) out.push(`| v${r.version + 1} | ${iso(r.createdAt)} | ${esc(r.by || "-")} | ${esc(r.changeSummary || "Updated")} |`);
  out.push(`| v1 | ${iso(n.createdAt)} | - | Created |`);
  out.push("");
  if (n.transcript?.trim()) out.push("## 6. Transcript / raw notes", "", n.transcript.trim(), "");
  return out.join("\n");
}
