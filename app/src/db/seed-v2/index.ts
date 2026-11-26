/**
 * Version 2 seeds and backfills. Maintainer: Sirah Digital.
 *
 * - seedV2Demo: demo purchase orders, returns/advances and AMC data. Each step is idempotent (skips when its table has rows).
 * - backfillV2: data fixes only (quotation cost dates, delivery cost rates). Safe on real data.
 */
import type { DB } from "../index";
import { backfillQuoteCostDates, seedPurchaseOrders } from "./purchase-orders";
import { backfillDeliveryCosts, seedReturnsAndAdvances } from "./returns-advances";
import { seedAmc } from "./amc";

export async function seedV2Demo(db: DB): Promise<void> {
  await seedPurchaseOrders(db);
  await backfillQuoteCostDates(db);
  await seedReturnsAndAdvances(db);
  await seedAmc(db);
}

export async function backfillV2(db: DB): Promise<{ quoteLines: number; deliveryLines: number }> {
  const quoteLines = await backfillQuoteCostDates(db);
  const deliveryLines = await backfillDeliveryCosts(db);
  return { quoteLines, deliveryLines };
}
