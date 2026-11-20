import { Card, Field, Input, LinkButton, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { SYSTEMS } from "@/lib/constants";
import type { items } from "@/db/schema";

type Item = typeof items.$inferSelect;

/** Create / edit item form (server component). `action` is a bound server action. */
export function ItemForm({ action, item, groups, makes, cancelHref }: {
  action: (fd: FormData) => Promise<void>;
  item?: Item;
  groups: string[];
  makes: string[];
  cancelHref: string;
}) {
  return (
    <form action={action} className="space-y-4">
      <Card title="Identification">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Item code" required hint="Unique, e.g. HS-PGI-150">
            <Input name="code" required maxLength={40} defaultValue={item?.code} autoCapitalize="characters" />
          </Field>
          <Field label="Name" required>
            <Input name="name" required maxLength={200} defaultValue={item?.name} />
          </Field>
          <Field label="System" required>
            <Select name="system" required defaultValue={item?.system ?? "hydrant_sprinkler"}>
              {Object.entries(SYSTEMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Group" required hint="Price master row, e.g. Pipe GI, Butterfly Valve">
            <Input name="groupName" required maxLength={120} list="item-groups" defaultValue={item?.groupName} />
            <datalist id="item-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
          </Field>
          <Field label="Size" hint="Use NB for pipe sizes (150NB) so they appear in the size matrix">
            <Input name="size" maxLength={40} defaultValue={item?.size ?? ""} />
          </Field>
          <Field label="Make / brand">
            <Input name="make" maxLength={80} list="item-makes" defaultValue={item?.make ?? ""} />
            <datalist id="item-makes">{makes.map((m) => <option key={m} value={m} />)}</datalist>
          </Field>
          <Field label="UOM" required>
            <Input name="uom" required maxLength={20} list="item-uoms" defaultValue={item?.uom ?? "Nos"} />
            <datalist id="item-uoms">{["Nos", "Mtr", "Set", "Kg", "Ltr", "Lot", "Roll", "Pair"].map((u) => <option key={u} value={u} />)}</datalist>
          </Field>
          <Field label="HSN code">
            <Input name="hsn" maxLength={20} defaultValue={item?.hsn ?? ""} inputMode="numeric" />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea name="description" defaultValue={item?.description ?? ""} />
          </Field>
        </div>
      </Card>
      <Card title="Pricing & stock">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="GST %" required>
            <Input name="gstRate" type="number" step="0.01" min={0} max={28} required defaultValue={item?.gstRate ?? 18} />
          </Field>
          <Field label="List price (₹)" hint={item ? "Use “Update list price” on the item page to record history" : "Used until the first purchase invoice is posted"}>
            <Input name="listPrice" type="number" step="0.01" min={0} defaultValue={item?.listPrice ?? ""} disabled={!!item} />
          </Field>
          <Field label="Default markup %" required>
            <Input name="markupPct" type="number" step="0.01" min={0} max={500} required defaultValue={item?.markupPct ?? 40} />
          </Field>
          <Field label="Erection rate (₹/unit)">
            <Input name="erectionRate" type="number" step="0.01" min={0} defaultValue={item?.erectionRate ?? 0} />
          </Field>
          <Field label="Reorder level">
            <Input name="reorderLevel" type="number" step="0.01" min={0} defaultValue={item?.reorderLevel ?? 0} />
          </Field>
          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="volatilePrice" defaultChecked={item?.volatilePrice ?? false} className="h-4 w-4 accent-brand-600" />
              Volatile price (pipes) — flag stale after 7 days
            </label>
            {item && (
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="active" defaultChecked={item.active} className="h-4 w-4 accent-brand-600" />
                Active
              </label>
            )}
          </div>
        </div>
      </Card>
      <div className="flex flex-wrap gap-2">
        <SubmitButton>{item ? "Save changes" : "Create item"}</SubmitButton>
        <LinkButton href={cancelHref} variant="secondary">Cancel</LinkButton>
      </div>
    </form>
  );
}
