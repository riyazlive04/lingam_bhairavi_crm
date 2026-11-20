/**
 * Rule-based automation agents (zero AI credits). Public entry point.
 *   import { runAgents, refreshIfStale, AGENTS } from "@/lib/agents";
 */
import "server-only";
export { runAgents, refreshIfStale, loadAgentRules, loadCompany, applyDrafts, lastAgentRunAt, type AgentRuleState } from "./engine";
export { AGENTS, getAgent } from "./registry";
export { alertScope } from "./scope";
export type * from "./types";
