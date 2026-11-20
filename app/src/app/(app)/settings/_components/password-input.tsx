"use client";
import { useState } from "react";
import { Eye, EyeOff, Wand2 } from "lucide-react";
import { Button, Input } from "@/components/ui";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function generate(len = 12) {
  const bytes = new Uint32Array(len);
  crypto.getRandomValues(bytes);
  let p = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  if (!/[0-9]/.test(p)) p = p.slice(0, -1) + "7";
  if (!/[A-Za-z]/.test(p)) p = "K" + p.slice(1);
  return p;
}

/** Password field with show/hide and a "generate" helper (generated value never leaves the browser except on submit). */
export function PasswordInput({ name = "password", label = "Temporary password", id }: { name?: string; label?: string; id?: string }) {
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  return (
    <div className="flex gap-1">
      <Input
        id={id} name={name} type={show ? "text" : "password"} required minLength={8} maxLength={200} autoComplete="new-password"
        value={value} onChange={(e) => setValue(e.target.value)} aria-label={label} className="font-mono"
      />
      <Button type="button" variant="secondary" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>
        {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
      </Button>
      <Button type="button" variant="secondary" onClick={() => { setValue(generate()); setShow(true); }} aria-label="Generate password" title="Generate">
        <Wand2 className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}
