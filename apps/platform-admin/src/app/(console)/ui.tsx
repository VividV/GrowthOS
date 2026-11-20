"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Checkbox, Input, Select, Textarea, toast, type ButtonProps } from "@platform/ui";
import { savePlanAction, setAiSettingsAction, setFlagAction, setSupportStatusAction } from "@/lib/actions";

type R = { ok: boolean; message?: string; error?: string };
function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return {
    pending,
    run: (fn: () => Promise<R>) => start(async () => {
      const r = await fn();
      if (r.ok) { toast.success(r.message ?? "Saved"); router.refresh(); } else toast.error(r.error ?? "Failed");
    }),
  };
}

export function ActionButton({ label, action, confirm, ...props }: { label: string; action: () => Promise<R>; confirm?: string } & ButtonProps) {
  const { pending, run } = useRun();
  return <Button {...props} loading={pending} onClick={() => { if (!confirm || window.confirm(confirm)) run(action); }}>{label}</Button>;
}

export function FlagToggle({ flagKey, enabled }: { flagKey: string; enabled: boolean }) {
  const { pending, run } = useRun();
  return <Checkbox checked={enabled} disabled={pending} onChange={(e) => run(() => setFlagAction(flagKey, e.target.checked))} aria-label={`Toggle ${flagKey}`} />;
}

export function SupportStatus({ id, status }: { id: string; status: string }) {
  const { pending, run } = useRun();
  return (
    <Select value={status} disabled={pending} className="h-8 w-36 text-xs" onChange={(e) => run(() => setSupportStatusAction(id, e.target.value))}>
      {["open", "in_progress", "resolved", "closed"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
    </Select>
  );
}

export function AiSettings({ provider, model, configured }: { provider: string; model: string; configured: boolean }) {
  const [p, setP] = useState(provider);
  const [m, setM] = useState(model);
  const { pending, run } = useRun();
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select value={p} onChange={(e) => setP(e.target.value)}><option value="anthropic">Anthropic (Claude)</option><option value="disabled">Disabled</option></Select>
        <Select value={m} onChange={(e) => setM(e.target.value)}>
          {["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"].map((x) => <option key={x}>{x}</option>)}
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">API key status: {configured ? "ANTHROPIC_API_KEY is set on the Growth OS deployment." : "Keys live in server environment variables only — they are never stored in the database."}</p>
      <Button loading={pending} onClick={() => run(() => setAiSettingsAction(p, m))}>Save AI settings</Button>
    </div>
  );
}

export interface PlanEdit {
  id: string; code: string; name: string; description: string; price: number; paystack_plan_code: string | null; is_active: boolean; is_public: boolean;
  features: string[]; entitlements: { key: string; enabled: boolean; limit_value: number | null }[];
}

export function PlanEditor({ plan, canEdit }: { plan: PlanEdit; canEdit: boolean }) {
  const [p, setP] = useState(plan);
  const { pending, run } = useRun();
  const setEnt = (key: string, patch: Partial<PlanEdit["entitlements"][number]>) =>
    setP((x) => ({ ...x, entitlements: x.entitlements.map((e) => (e.key === key ? { ...e, ...patch } : e)) }));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-sm">Name<Input value={p.name} disabled={!canEdit} onChange={(e) => setP({ ...p, name: e.target.value })} /></label>
        <label className="space-y-1 text-sm">Monthly price (NGN)<Input type="number" value={p.price} disabled={!canEdit} onChange={(e) => setP({ ...p, price: Number(e.target.value) })} /></label>
        <label className="space-y-1 text-sm">Paystack plan code<Input value={p.paystack_plan_code ?? ""} placeholder="PLN_… (enables auto-renewal)" disabled={!canEdit} onChange={(e) => setP({ ...p, paystack_plan_code: e.target.value })} /></label>
      </div>
      <label className="block space-y-1 text-sm">Description<Input value={p.description} disabled={!canEdit} onChange={(e) => setP({ ...p, description: e.target.value })} /></label>
      <label className="block space-y-1 text-sm">Marketing features (one per line)
        <Textarea value={p.features.join("\n")} disabled={!canEdit} onChange={(e) => setP({ ...p, features: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} />
      </label>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2"><Checkbox checked={p.is_active} disabled={!canEdit} onChange={(e) => setP({ ...p, is_active: e.target.checked })} /> Active</label>
        <label className="flex items-center gap-2"><Checkbox checked={p.is_public} disabled={!canEdit} onChange={(e) => setP({ ...p, is_public: e.target.checked })} /> Shown on pricing</label>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-2xs uppercase tracking-wide text-muted-foreground"><tr><th className="py-1">Entitlement</th><th>Enabled</th><th>Limit (blank = unlimited)</th></tr></thead>
        <tbody>
          {p.entitlements.map((e) => (
            <tr key={e.key} className="border-t">
              <td className="py-1.5 font-mono text-xs">{e.key}</td>
              <td><Checkbox checked={e.enabled} disabled={!canEdit} onChange={(ev) => setEnt(e.key, { enabled: ev.target.checked })} /></td>
              <td>{e.key.startsWith("max_") || e.key.endsWith("_per_month") ? (
                <Input type="number" min="0" className="h-8 w-32" disabled={!canEdit} value={e.limit_value ?? ""} onChange={(ev) => setEnt(e.key, { limit_value: ev.target.value === "" ? null : Number(ev.target.value) })} />
              ) : <span className="text-xs text-muted-foreground">on/off</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {canEdit && <Button loading={pending} onClick={() => run(() => savePlanAction(p))}>Save {p.name}</Button>}
    </div>
  );
}
