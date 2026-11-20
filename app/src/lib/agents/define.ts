import { z } from "zod";
import type { Agent, AgentParams, ParamMeta } from "./types";

/** Type helper: keeps each agent's params strongly typed while allowing a heterogeneous registry. */
export function defineAgent<P extends AgentParams>(a: Agent<P>): Agent {
  return a as unknown as Agent;
}

/** zod object of numeric params built from metadata (min/max enforced, strings coerced). */
export function numericParams<K extends string>(meta: Record<K, ParamMeta>): z.ZodType<Record<K, number>> {
  const shape: Record<string, z.ZodType<number>> = {};
  for (const k of Object.keys(meta) as K[]) {
    const m = meta[k];
    let s = z.coerce.number({ error: `${m.label} must be a number` }).min(m.min ?? 0, `${m.label} must be ≥ ${m.min ?? 0}`);
    if (m.max != null) s = s.max(m.max, `${m.label} must be ≤ ${m.max}`);
    shape[k] = s;
  }
  return z.object(shape) as unknown as z.ZodType<Record<K, number>>;
}
