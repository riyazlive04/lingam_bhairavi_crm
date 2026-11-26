import { systemLabel } from "@/lib/amc";
import { Badge, type Tone } from "@/components/ui";

export function SystemChips({ systems, className }: { systems: readonly string[] | null | undefined; className?: string }) {
  if (!systems?.length) return <span className="text-ink-faint">-</span>;
  return (
    <span className={`inline-flex flex-wrap gap-1 ${className ?? ""}`}>
      {systems.map((s) => <Badge key={s} tone="violet">{systemLabel(s)}</Badge>)}
    </span>
  );
}

/** Tones for AMC contract, visit and service call statuses (the shared STATUS_TONE does not know these). */
const TONES: Record<string, Tone> = {
  active: "green", expired: "red", renewed: "violet", cancelled: "gray", draft: "gray",
  scheduled: "blue", done: "green", missed: "red",
  open: "amber", assigned: "blue", in_progress: "violet", resolved: "green", closed: "gray",
};
const LABELS: Record<string, string> = { in_progress: "In progress" };

export function AmcStatusBadge({ status }: { status: string }) {
  return <Badge tone={TONES[status] ?? "gray"} dot className="capitalize">{LABELS[status] ?? status.replace(/_/g, " ")}</Badge>;
}
