"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { and, count, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DB } from "@/db";
import { settings, users } from "@/db/schema";
import { requireWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ROLES, type Role } from "@/lib/constants";
import { APPROVAL_MODES, type ApprovalMode } from "@/lib/pricing";
import { UserError, errMsg, flashUrl, isUniqueViolation, zId } from "../projects/_lib/forms";
import { formatBankDetails, readSetting } from "./_lib/settings";

const ROLE_KEYS = Object.keys(ROLES) as [Role, ...Role[]];
const t = (max: number) => z.preprocess((v) => (typeof v === "string" ? v.trim() : ""), z.string().max(max));

async function upsertSetting(db: DB, key: string, value: Record<string, unknown>) {
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}

// ---------------------------------------------------------------- company & pricing
const CompanyInput = z.object({
  name: z.string().trim().min(1, "Company name is required").max(200),
  tagline: t(200),
  address: t(1000),
  gstin: z.preprocess((v) => (typeof v === "string" ? v.trim().toUpperCase() : ""),
    z.string().refine((g) => g === "" || /^[0-9]{2}[A-Z0-9]{13}$/.test(g), "GSTIN must be 15 characters (e.g. 33ABCDE1234F1Z5)")),
  phone: t(60),
  email: z.preprocess((v) => (typeof v === "string" ? v.trim() : ""), z.union([z.literal(""), z.email("Enter a valid email")])),
  website: t(200),
  bankAccountName: t(120),
  bankName: t(120),
  bankAccountNo: t(40),
  bankIfsc: z.preprocess((v) => (typeof v === "string" ? v.trim().toUpperCase() : ""),
    z.string().refine((g) => g === "" || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(g), "IFSC must look like SBIN0001234")),
  bankBranch: t(120),
  quoteTerms: t(10000),
});

export async function saveCompany(form: FormData) {
  const user = await requireWrite("settings");
  const db = await getDb();
  let target = "/settings";
  try {
    const d = CompanyInput.parse(Object.fromEntries(form));
    const existing = await readSetting(db, "company");
    const bank = { accountName: d.bankAccountName, bankName: d.bankName, accountNo: d.bankAccountNo, ifsc: d.bankIfsc, branch: d.bankBranch };
    const value = {
      ...existing,
      name: d.name, tagline: d.tagline, address: d.address, gstin: d.gstin, phone: d.phone, email: d.email, website: d.website,
      bank, bankDetails: formatBankDetails(bank), quoteTerms: d.quoteTerms,
    };
    await upsertSetting(db, "company", value);
    await audit(db, user.id, "update", "settings", null, { key: "company" });
    target = flashUrl("/settings", "ok", "Company profile saved");
  } catch (e) {
    target = flashUrl("/settings", "err", errMsg(e));
  }
  revalidatePath("/", "layout");
  redirect(target);
}

const PricingInput = z.object({
  defaultMarkupPct: z.coerce.number().min(0, "Markup cannot be negative").max(500),
  minMarginPct: z.coerce.number().min(0).max(100),
  gstPct: z.coerce.number().min(0).max(100),
  quoteValidityDays: z.coerce.number().int().min(1).max(365),
  approvalMode: z.enum(APPROVAL_MODES as [ApprovalMode, ...ApprovalMode[]], "Choose when quotations need approval").default("below_margin"),
});

export async function savePricing(form: FormData) {
  const user = await requireWrite("settings");
  const db = await getDb();
  let target = "/settings";
  try {
    const d = PricingInput.parse(Object.fromEntries(form));
    const existing = await readSetting(db, "pricing");
    await upsertSetting(db, "pricing", { ...existing, ...d });
    await audit(db, user.id, "update", "settings", null, { key: "pricing", before: existing, after: d });
    target = flashUrl("/settings#pricing", "ok", "Pricing defaults saved");
  } catch (e) {
    target = flashUrl("/settings#pricing", "err", errMsg(e));
  }
  revalidatePath("/", "layout");
  redirect(target);
}

// ---------------------------------------------------------------- users
const zPassword = z.string().min(8, "Password must be at least 8 characters").max(200)
  .refine((p) => /[A-Za-z]/.test(p) && /[0-9]/.test(p), "Password must contain letters and numbers");

const NewUser = z.object({
  name: z.string().trim().min(2, "Name is required").max(120),
  email: z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.email("Enter a valid email").max(160)),
  role: z.enum(ROLE_KEYS),
  phone: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : undefined), z.string().max(20).optional()),
  password: zPassword,
});

async function activeAdminCount(db: DB, excludeId?: number) {
  const [r] = await db.select({ n: count() }).from(users)
    .where(and(eq(users.role, "admin"), eq(users.active, true), excludeId ? ne(users.id, excludeId) : undefined));
  return Number(r?.n ?? 0);
}

export async function createUser(form: FormData) {
  const user = await requireWrite("settings");
  const db = await getDb();
  let target = "/settings/users";
  try {
    const d = NewUser.parse(Object.fromEntries(form));
    const [dupe] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${d.email}`).limit(1);
    if (dupe) throw new UserError("A user with this email already exists");
    const passwordHash = await bcrypt.hash(d.password, 10);
    let row: { id: number };
    try {
      [row] = await db.insert(users).values({ name: d.name, email: d.email, role: d.role, phone: d.phone ?? null, passwordHash, active: true }).returning({ id: users.id });
    } catch (e) {
      if (isUniqueViolation(e)) throw new UserError("A user with this email already exists");
      throw e;
    }
    await audit(db, user.id, "create", "user", row.id, { email: d.email, role: d.role });
    target = flashUrl("/settings/users", "ok", `User ${d.name} added. Share the temporary password securely`);
  } catch (e) {
    target = flashUrl("/settings/users", "err", errMsg(e));
  }
  revalidatePath("/settings/users");
  redirect(target);
}

export async function changeUserRole(form: FormData) {
  const user = await requireWrite("settings");
  const db = await getDb();
  let target = "/settings/users";
  try {
    const id = zId.parse(form.get("id"));
    const role = z.enum(ROLE_KEYS).parse(form.get("role"));
    if (id === user.id) throw new UserError("You cannot change your own role");
    const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!u) throw new UserError("User not found");
    if (u.role !== role) {
      if (u.role === "admin" && u.active && (await activeAdminCount(db, id)) === 0) throw new UserError("At least one active admin is required");
      await db.update(users).set({ role }).where(eq(users.id, id));
      await audit(db, user.id, "update", "user", id, { role: [u.role, role] });
    }
    target = flashUrl("/settings/users", "ok", `${u.name} is now ${ROLES[role]} (applies immediately)`);
  } catch (e) {
    target = flashUrl("/settings/users", "err", errMsg(e));
  }
  revalidatePath("/settings/users");
  redirect(target);
}

export async function setUserActive(form: FormData) {
  const user = await requireWrite("settings");
  const db = await getDb();
  let target = "/settings/users";
  try {
    const id = zId.parse(form.get("id"));
    const active = form.get("active") === "1";
    if (id === user.id && !active) throw new UserError("You cannot deactivate yourself");
    const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!u) throw new UserError("User not found");
    if (!active && u.role === "admin" && (await activeAdminCount(db, id)) === 0) throw new UserError("At least one active admin is required");
    await db.update(users).set({ active }).where(eq(users.id, id));
    await audit(db, user.id, "update", "user", id, { active });
    target = flashUrl("/settings/users", "ok", `${u.name} ${active ? "activated" : "deactivated. They can no longer sign in"}`);
  } catch (e) {
    target = flashUrl("/settings/users", "err", errMsg(e));
  }
  revalidatePath("/settings/users");
  redirect(target);
}

export async function resetPassword(form: FormData) {
  const user = await requireWrite("settings");
  const db = await getDb();
  let target = "/settings/users";
  try {
    const id = zId.parse(form.get("id"));
    const password = zPassword.parse(form.get("password"));
    const [u] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, id)).limit(1);
    if (!u) throw new UserError("User not found");
    await db.update(users).set({ passwordHash: await bcrypt.hash(password, 10) }).where(eq(users.id, id));
    await audit(db, user.id, "update", "user", id, { passwordReset: true });
    target = flashUrl("/settings/users", "ok", `Password reset for ${u.name}`);
  } catch (e) {
    target = flashUrl("/settings/users", "err", errMsg(e));
  }
  revalidatePath("/settings/users");
  redirect(target);
}
