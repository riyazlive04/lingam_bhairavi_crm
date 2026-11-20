import "server-only";
import { followupAgent, marginGuardAgent, quoteExpiryAgent } from "./sales";
import { lowStockAgent, pendingDeliveryAgent, refillDueAgent, stalePriceAgent } from "./operations";
import { payablesAgent, receivablesAgent } from "./finance";
import { dataHygieneAgent, projectBudgetAgent } from "./hygiene";
import type { Agent } from "./types";

/** Execution order matters: quote_expiry first so follow-up alerts for just-expired quotes are cleared in the same run. */
export const AGENTS: Agent[] = [
  quoteExpiryAgent,
  pendingDeliveryAgent,
  followupAgent,
  refillDueAgent,
  receivablesAgent,
  payablesAgent,
  stalePriceAgent,
  marginGuardAgent,
  lowStockAgent,
  projectBudgetAgent,
  dataHygieneAgent,
];

export const AGENT_MAP = new Map(AGENTS.map((a) => [a.key, a]));
export const getAgent = (key: string) => AGENT_MAP.get(key);
