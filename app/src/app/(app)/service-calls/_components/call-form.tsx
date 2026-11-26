"use client";
import { useState } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormFooter, FormSection } from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { createCall } from "../actions";

type Opt = { id: number; name: string };
export type ContractOpt = { id: number; customerId: number; number: string; responseHours: number; systems: string[] };

const DEFAULT_HOURS = 48;

/** New service call. Picking a customer auto-selects their active AMC so the SLA follows the contract. */
export function CallForm(p: {
  customers: Opt[];
  contracts: ContractOpt[];
  engineers: Opt[];
  systems: Record<string, string>;
  priorities: Record<string, string>;
  canAssign: boolean;
  selfId: number | null;
  initialCustomerId?: number;
  initialContractId?: number;
}) {
  const firstFor = (cid: number) => p.contracts.find((c) => c.customerId === cid);
  const init = p.contracts.find((c) => c.id === p.initialContractId) ?? (p.initialCustomerId ? firstFor(p.initialCustomerId) : undefined);
  const [customerId, setCustomerId] = useState(init?.customerId ?? p.initialCustomerId ?? 0);
  const [contractId, setContractId] = useState(init?.id ?? 0);
  const [system, setSystem] = useState(init?.systems.length === 1 ? init.systems[0] : "");
  const own = p.contracts.filter((c) => c.customerId === customerId);
  const contract = p.contracts.find((c) => c.id === contractId);
  const hours = contract?.responseHours ?? DEFAULT_HOURS;

  const onCustomer = (id: number) => {
    setCustomerId(id);
    const c = firstFor(id);
    setContractId(c?.id ?? 0);
    if (c?.systems.length === 1) setSystem(c.systems[0]);
  };

  return (
    <form action={createCall} className="space-y-4">
      <FormSection title="Who and where" description="The customer, their AMC and who reported the problem.">
          <Field label="Customer" required>
            <Select className="h-11 sm:h-9.5" name="customerId" required value={customerId || ""} onChange={(e) => onCustomer(Number(e.target.value))}>
              <option value="" disabled>Select customer</option>
              {p.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="AMC contract" hint={customerId ? (own.length ? `Response due within ${hours} hours.` : `No active AMC. Chargeable call, response due within ${DEFAULT_HOURS} hours.`) : undefined}>
            <Select className="h-11 sm:h-9.5" name="contractId" value={contractId || ""} onChange={(e) => setContractId(Number(e.target.value))} disabled={!own.length}>
              <option value="">No contract (chargeable)</option>
              {own.map((c) => <option key={c.id} value={c.id}>{c.number} · {c.responseHours} h response</option>)}
            </Select>
          </Field>
          <Field label="Reported by" hint="Name and phone of the person who called.">
            <Input className="h-11 sm:h-9.5" name="reportedBy" maxLength={120} autoComplete="off" placeholder="e.g. Mr. Ravi, maintenance, 98400 12345" />
          </Field>
          <Field label="System">
            <Select className="h-11 sm:h-9.5" name="system" value={system} onChange={(e) => setSystem(e.target.value)}>
              <option value="">Not sure</option>
              {Object.entries(p.systems).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
      </FormSection>

      <FormSection title="Problem" description="How urgent it is and what the customer told you.">
          <Field label="Priority" required>
            <Select className="h-11 sm:h-9.5" name="priority" defaultValue="normal">
              {Object.entries(p.priorities).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Engineer">
            {p.canAssign ? (
              <Select className="h-11 sm:h-9.5" name="engineerId" defaultValue="">
                <option value="">Assign later</option>
                {p.engineers.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            ) : (
              <Select className="h-11 sm:h-9.5" name="engineerId" defaultValue={p.selfId ?? ""}>
                <option value="">Leave unassigned</option>
                {p.selfId && <option value={p.selfId}>Me</option>}
              </Select>
            )}
          </Field>
          <Field label="What is wrong?" required className="sm:col-span-2">
            <Textarea name="description" required rows={4} maxLength={4000} placeholder="e.g. Jockey pump not stopping, pressure dropping in the sprinkler line" />
          </Field>
      </FormSection>

      <FormFooter cancelHref="/service-calls" note={customerId ? `Response due within ${hours} hours.` : undefined}>
        <SubmitButton size="lg" pendingText="Logging…">Log call</SubmitButton>
      </FormFooter>
    </form>
  );
}
