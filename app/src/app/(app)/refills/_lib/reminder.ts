/** Client-safe helper: internal WhatsApp/phone reminder text for due extinguishers of one customer. */
export type ReminderRow = { extType: string; make: string | null; qty: number; location: string | null; nextDueDate: string };

const fmt = (d: string) => {
  const dt = new Date(d + "T00:00:00");
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

export function reminderText(customerName: string, rows: ReminderRow[]) {
  const lines = rows.map((r) => `• ${r.qty} × ${r.extType}${r.make ? ` (${r.make})` : ""}${r.location ? `, ${r.location}` : ""}: due ${fmt(r.nextDueDate)}`);
  const units = rows.reduce((s, r) => s + r.qty, 0);
  return [
    `Dear ${customerName},`,
    "",
    `Greetings from Linga Bhairavi Enterprise, Hosur. ${units} fire extinguisher${units === 1 ? " is" : "s are"} due for refilling at your premises:`,
    ...lines,
    "",
    "Timely refilling keeps your site compliant with fire safety norms. Please let us know a convenient date for our team to visit.",
    "",
    "Thank you,",
    "Linga Bhairavi Enterprise",
  ].join("\n");
}
