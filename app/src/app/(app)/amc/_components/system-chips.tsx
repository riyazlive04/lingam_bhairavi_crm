import { systemLabel, type expiryInfo } from "@/lib/amc";
import { Badge, cx } from "@/components/ui";
import { StatusPill } from "@/components/patterns";

/** Fire systems covered by a contract, as small neutral chips (a category, not a status). */
export function SystemChips({ systems, className }: { systems: readonly string[] | null | undefined; className?: string }) {
  if (!systems?.length) return <span className="text-ink-faint">-</span>;
  return (
    <span className={cx("inline-flex flex-wrap gap-1", className)}>
      {systems.map((s) => <Badge key={s} tone="gray">{systemLabel(s)}</Badge>)}
    </span>
  );
}

/** Days-left chip for a live contract, coloured with the shared status semantics. */
export function ExpiryPill({ info }: { info: ReturnType<typeof expiryInfo> }) {
  const semantic = info.tone === "red" ? "danger" : info.tone === "amber" ? "warning" : "neutral";
  return <StatusPill semantic={semantic} label={info.label} noDot={semantic === "neutral"} />;
}
