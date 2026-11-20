/**
 * Rule-based automation agents — shared types. OWNED BY: Team E (Automation Agents).
 * Agents are deterministic SQL/TypeScript rules. They never call an LLM / AI service.
 */
import type { z } from "zod";
import type { DB } from "@/db";
import type { Role } from "@/lib/constants";

export type Severity = "info" | "warning" | "critical";
export type AgentTrigger = "cron" | "manual";
export type AgentParams = Record<string, number>;

/** What an agent wants to exist as an (open) alert right now. Keyed by `dedupeKey`. */
export type AlertDraft = {
  dedupeKey: string;
  severity: Severity;
  title: string;
  message?: string | null;
  link?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  assignedRole?: Role | null;
  assignedUserId?: number | null;
  /** YYYY-MM-DD */
  dueDate?: string | null;
};

export type CompanyInfo = { name: string; phone?: string; email?: string; bank?: string; address?: string };

export type AgentContext<P extends AgentParams = AgentParams> = {
  db: DB;
  /** today in IST, YYYY-MM-DD */
  today: string;
  params: P;
  trigger: AgentTrigger;
  company: CompanyInfo;
};

export type AgentResult = {
  alerts: AlertDraft[];
  /**
   * Optional filter: given the dedupe keys of this agent's currently open/snoozed alerts that were NOT
   * re-emitted in this run, return the keys that should be auto-resolved. Default: all of them.
   */
  resolveKeys?: (openKeys: string[]) => string[];
  /** emails queued to the outbox by this run */
  emails?: number;
  /** automatic data changes made by this run (e.g. quotes auto-expired) */
  actions?: number;
  /** human-readable notes for the run summary */
  notes?: string[];
};

export type ParamMeta = { label: string; hint?: string; min?: number; max?: number; step?: number; unit?: string };

export type Agent<P extends AgentParams = AgentParams> = {
  key: string;
  name: string;
  description: string;
  /** role that normally acts on this agent's alerts */
  ownerRole: Role;
  defaultParams: P;
  paramSchema: z.ZodType<P>;
  paramMeta: Record<keyof P & string, ParamMeta>;
  /** estimated minutes of manual checking avoided per new alert */
  minutesSavedPerAlert: number;
  /** estimated minutes saved per email sent automatically (dunning) */
  minutesSavedPerEmail?: number;
  /** estimated minutes saved per automatic action */
  minutesSavedPerAction?: number;
  run: (ctx: AgentContext<P>) => Promise<AgentResult>;
};

export type AgentRunOutcome = {
  agent: string;
  status: "ok" | "error" | "skipped";
  alertsCreated: number;
  alertsReopened: number;
  alertsResolved: number;
  alertsUpdated: number;
  emailsQueued: number;
  actions: number;
  minutesSaved: number;
  summary: string;
};

export type RunAgentsResult = {
  trigger: AgentTrigger;
  startedAt: string;
  finishedAt: string;
  outcomes: AgentRunOutcome[];
  totals: { alertsCreated: number; alertsResolved: number; emailsQueued: number; minutesSaved: number; errors: number };
  outbox: { sent: number; failed: number };
};
