/**
 * Startup digest: shown once per login (cookie "lbe_digest" = "1", set by /api/auth/login, cleared on dismiss).
 * Lists, for the signed-in user's role: undelivered customer-PO lines (overdue first), follow-ups due,
 * refills due within 10 days, overdue receivables, expenses awaiting approval, and their top alerts.
 * Rendered inside <Suspense> by the app layout, so it never delays the first paint. When the agents are
 * older than 6 hours they are refreshed in the background (next/server after()), not in the request path.
 * Never throws: the app layout must not break because of the digest.
 */
import { cookies } from "next/headers";
import { after } from "next/server";
import { getDb } from "@/db";
import type { SessionUser } from "@/lib/session";
import { pendingQtyOf } from "@/lib/orders";
import { canApproveExpenses, canRead } from "@/lib/rbac";
import { daysBetween, fmtDate, money0, moneyShort, qty, todayIST } from "@/lib/format";
import { lastAgentRunAt, refreshIfStale } from "@/lib/agents";
import {
  followUpsDue, overdueReceivables, pendingDeliveryCounts, pendingDeliveryLines, pendingExpenses, refillsDueByCustomer, topAlerts,
} from "@/lib/agents/queries";
import { describeDue } from "@/lib/agents/rules";
import { StartupDigestDialog, type DigestItem, type DigestSection } from "./startup-digest-dialog";

const LIMIT = 6;

export async function StartupDigest({ user }: { user: SessionUser }) {
  const c = await cookies();
  if (c.get("lbe_digest")?.value !== "1") return null;
  try {
    const db = await getDb();
    // If the agents have not run for 6 hours, refresh them after the response is sent (never blocks the page).
    // The digest shows what is already known; fresh alerts appear on the next navigation.
    const last = await lastAgentRunAt(db);
    const stale = !last || Date.now() - last.getTime() > 6 * 3600e3;
    // Very first run on a fresh database: wait for it (we are inside <Suspense>, so the page has already painted).
    let refreshed = false;
    if (!last) refreshed = await refreshIfStale(db, 6);
    else if (stale) after(() => refreshIfStale(db, 6).then(() => undefined));
    const today = todayIST();
    const role = user.role;
    const showDeliveries = canRead(role, "orders") && ["admin", "sales", "store", "purchase"].includes(role);
    const showFollowUps = canRead(role, "followups");
    const showRefills = canRead(role, "refills") && role !== "accounts";
    const showReceivables = canRead(role, "billing");
    const showExpenses = canApproveExpenses(role);

    const [lines, lineCounts, fus, refills, rcv, exps, alerts] = await Promise.all([
      showDeliveries ? pendingDeliveryLines(db, LIMIT) : Promise.resolve([]),
      showDeliveries ? pendingDeliveryCounts(db, today) : Promise.resolve(null),
      showFollowUps ? followUpsDue(db, today, LIMIT) : Promise.resolve([]),
      showRefills ? refillsDueByCustomer(db, today, 10, LIMIT) : Promise.resolve([]),
      showReceivables ? overdueReceivables(db, today, LIMIT) : Promise.resolve([]),
      showExpenses ? pendingExpenses(db, LIMIT) : Promise.resolve([]),
      topAlerts(db, user, 5),
    ]);

    const sections: DigestSection[] = [];
    if (showDeliveries) {
      sections.push({
        key: "deliveries",
        title: "Customer PO lines still to deliver",
        href: "/orders",
        total: lineCounts?.total,
        items: lines.map((l): DigestItem => {
          const pending = pendingQtyOf(l);
          const late = l.expected ? daysBetween(l.expected, today) : null;
          return {
            label: `${l.poNumber ? "PO " + l.poNumber : l.orderNumber} · ${l.customer}: ${l.description}`,
            sub: `${qty(pending)} ${l.uom} pending · ${l.expected ? describeDue(l.expected, today) : "no delivery date set"}`,
            href: `/orders/${l.orderId}`,
            tone: late != null && late > 0 ? "bad" : late == null ? "warn" : "info",
          };
        }),
      });
    }
    if (showFollowUps) {
      sections.push({
        key: "followups",
        title: "Follow-ups due today or overdue",
        href: "/follow-ups",
        items: fus.map((q) => ({
          label: `${q.number} · ${q.customer}`,
          sub: `${moneyShort(q.grandTotal)} · ${describeDue(q.nextFollowUpDate as string, today)}${q.phone ? " · " + q.phone : ""}`,
          href: `/quotations/${q.id}`,
          tone: (q.nextFollowUpDate as string) < today ? "bad" : "warn",
        })),
      });
    }
    if (showRefills) {
      sections.push({
        key: "refills",
        title: "Extinguisher refills due in the next 10 days",
        href: "/refills",
        items: refills.map((r) => ({
          label: `${r.customer}, ${r.units} extinguisher${r.units === 1 ? "" : "s"}`,
          sub: `${describeDue(r.due, today)} (${fmtDate(r.due)})${r.phone ? " · " + r.phone : ""}`,
          href: `/refills?customer=${r.customerId}`,
          tone: r.due < today ? "bad" : "info",
        })),
      });
    }
    if (showReceivables) {
      sections.push({
        key: "receivables",
        title: "Overdue receivables",
        href: "/billing",
        items: rcv.map((i) => ({
          label: `${i.number} · ${i.customer}: ${money0(i.outstanding)} due`,
          sub: describeDue(i.dueDate, today),
          href: `/billing/invoices/${i.id}`,
          tone: daysBetween(i.dueDate, today) > 60 ? "bad" : "warn",
        })),
      });
    }
    if (showExpenses) {
      sections.push({
        key: "expenses",
        title: "Expenses awaiting your approval",
        href: "/expenses?status=pending",
        items: exps.map((e) => ({
          label: `${e.voucherNo} · ${money0(e.amount)} · ${e.category.replace(/_/g, " ")}`,
          sub: `${fmtDate(e.date)}${e.by ? " · by " + e.by : ""}`,
          href: "/expenses?status=pending",
          tone: "info",
        })),
      });
    }
    sections.push({
      key: "alerts",
      title: "Top alerts for you",
      href: "/alerts",
      items: alerts.map((a) => ({
        label: a.title,
        sub: a.dueDate ? `Due ${fmtDate(a.dueDate)}` : undefined,
        href: a.link ?? "/alerts",
        tone: a.severity === "critical" ? "bad" : a.severity === "warning" ? "warn" : "info",
      })),
    });

    return <StartupDigestDialog userName={user.name} sections={sections} refreshed={refreshed} />;
  } catch (err) {
    console.error("[startup-digest] failed", err);
    return null;
  }
}
