/**
 * Daily agent run (Vercel Cron, 02:30 UTC = 08:00 IST — see vercel.json).
 * Vercel sends `Authorization: Bearer ${CRON_SECRET}`. Anything else gets 401.
 */
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { runAgents } from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const db = await getDb();
    const result = await runAgents(db, { trigger: "cron" });
    return NextResponse.json({ ok: result.totals.errors === 0, ...result });
  } catch (err) {
    console.error("[cron/agents] failed", err);
    return NextResponse.json({ ok: false, error: "Agent run failed" }, { status: 500 });
  }
}
