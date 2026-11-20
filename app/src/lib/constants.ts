/** Shared enums & labels. OWNED BY: Architect. */
export const SYSTEMS = {
  hydrant_sprinkler: "Hydrant & Sprinkler",
  fire_alarm: "Fire Alarm (FAS)",
  pa_system: "PA / Voice Evacuation",
  extinguisher_new: "Extinguishers — New",
  extinguisher_refill: "Extinguishers — Refilling",
  spares: "Spares",
  general: "General / Pump House",
} as const;
export type SystemKey = keyof typeof SYSTEMS;

export const ROLES = {
  admin: "Owner / Admin",
  sales: "Sales",
  purchase: "Purchase",
  accounts: "Accounts",
  engineer: "Site Engineer",
  store: "Store",
} as const;
export type Role = keyof typeof ROLES;

export const QUOTE_STATUSES = ["draft", "sent", "negotiation", "won", "lost", "expired"] as const;
export const ORDER_STATUSES = ["open", "partial", "delivered", "closed", "cancelled"] as const;
export const LINE_DELIVERY_STATUSES = ["pending", "ordered", "in_transit", "partial", "delivered", "cancelled"] as const;
export const PROJECT_STATUSES = ["planning", "active", "on_hold", "completed", "closed"] as const;
export const EXPENSE_CATEGORIES = {
  petrol: "Petrol / Fuel", travel: "Travel", lodging: "Lodging", food: "Food", labour: "Labour",
  transport: "Transport / Freight", material_local: "Local material purchase", misc: "Miscellaneous",
} as const;
export const FOLLOWUP_MODES = ["call", "email", "whatsapp", "visit", "meeting"] as const;
export const PAYMENT_MODES = ["bank", "upi", "cheque", "cash"] as const;
export const EXTINGUISHER_TYPES = [
  "ABC 2 Kg", "ABC 4 Kg", "ABC 6 Kg", "ABC 9 Kg", "ABC 25 Kg", "ABC 50 Kg",
  "CO2 2 Kg", "CO2 4.5 Kg", "CO2 9 Kg", "CO2 25 Kg", "CO2 50 Kg",
  "Clean Agent 2 Kg", "Clean Agent 4 Kg", "Clean Agent 6 Kg", "Foam 9 L", "Foam 50 L", "Water CO2 9 L",
] as const;

export const STATUS_TONE: Record<string, "gray" | "blue" | "amber" | "green" | "red" | "violet"> = {
  draft: "gray", sent: "blue", negotiation: "amber", won: "green", lost: "red", expired: "gray",
  open: "blue", partial: "amber", delivered: "green", closed: "gray", cancelled: "red",
  pending: "amber", ordered: "blue", in_transit: "violet",
  planning: "gray", active: "blue", on_hold: "amber", completed: "green",
  approved: "green", rejected: "red", issued: "blue", partially_paid: "amber", paid: "green", posted: "green",
  info: "blue", warning: "amber", critical: "red", done: "green", snoozed: "gray",
  retired: "gray", queued: "amber", logged: "violet", failed: "red", ok: "green", error: "red",
};
