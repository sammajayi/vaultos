"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { usd } from "@vaultos/sdk";
import { useToasts } from "@/lib/tx";
import { useWallet } from "@/lib/wallet";

export const money = (v: string | bigint | null | undefined) => usd(BigInt(v ?? 0));

export const short = (a: string | null | undefined, n = 4) => (a ? `${a.slice(0, n + 2)}…${a.slice(-n)}` : "");

export function Addr({ value, chars = 4 }: { value: string; chars?: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={value}
      onClick={() => navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); })}
      className="font-mono text-[13px] text-steel hover:text-ink"
    >
      {copied ? "Copied" : short(value, chars)}
    </button>
  );
}

export function ExplorerLink({ hash, address, children }: { hash?: string | null; address?: string; children?: ReactNode }) {
  const { config } = useWallet();
  const base = config?.explorerUrl;
  const label = children ?? short(hash ?? address, 5);
  if (!base) return <span className="font-mono text-[13px] text-steel" title="No explorer configured for this network">{label}</span>;
  return (
    <a href={`${base}/${hash ? "tx" : "address"}/${hash ?? address}`} target="_blank" rel="noreferrer" className="font-mono text-[13px] text-seal underline decoration-seal/30 underline-offset-2 hover:decoration-seal">
      {label}
    </a>
  );
}

const TONES: Record<string, string> = {
  PAID: "bg-verdigris-tint text-verdigris",
  APPROVED: "bg-verdigris-tint text-verdigris",
  ACTIVE: "bg-verdigris-tint text-verdigris",
  CONFIRMED: "bg-verdigris-tint text-verdigris",
  EXECUTED: "bg-verdigris-tint text-verdigris",
  AWAITING_HUMAN_APPROVAL: "bg-brass-tint text-brass",
  PENDING: "bg-sunk text-steel",
  ANALYZING: "bg-seal-tint text-seal",
  EXECUTING: "bg-seal-tint text-seal",
  REJECTED: "bg-oxblood-tint text-oxblood",
  FAILED: "bg-oxblood-tint text-oxblood",
  BLOCKED: "bg-oxblood-tint text-oxblood",
  PAUSED: "bg-brass-tint text-brass",
  REVOKED: "bg-oxblood-tint text-oxblood",
  EXPIRED: "bg-oxblood-tint text-oxblood",
  REMOVED: "bg-oxblood-tint text-oxblood",
};
const NAMES: Record<string, string> = {
  AWAITING_HUMAN_APPROVAL: "Needs your approval",
  ANALYZING: "Agent reviewing",
  EXECUTING: "Paying",
  PENDING: "Pending",
};
export function Status({ value }: { value: string }) {
  const label = NAMES[value] ?? value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
  return <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-[12.5px] font-medium ${TONES[value] ?? "bg-sunk text-steel"}`}>{label}</span>;
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "quiet" | "danger" | "good"; busy?: boolean };
export function Button({ tone = "quiet", busy, className = "", children, disabled, ...p }: BtnProps) {
  const styles = {
    primary: "bg-seal text-white hover:bg-seal-dark border-seal",
    quiet: "bg-panel text-ink hover:bg-sunk border-rule",
    danger: "bg-panel text-oxblood hover:bg-oxblood-tint border-oxblood/40",
    good: "bg-verdigris text-white hover:brightness-95 border-verdigris",
  }[tone];
  return (
    <button
      {...p}
      disabled={disabled || busy}
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-md border px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    >
      {busy && <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-[12.5px] text-steel">{hint}</span>}
      {error && <span className="mt-1 block text-[12.5px] text-oxblood">{error}</span>}
    </label>
  );
}

export function Input(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={`h-10 w-full rounded-md border border-rule bg-white px-3 text-[15px] placeholder:text-steel/60 focus:border-seal ${p.className ?? ""}`} />;
}

export function Section({ title, aside, children, className = "" }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`border-t border-rule py-6 ${className}`}>
      {(title || aside) && (
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          {title && <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHead({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
      <div>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight">{title}</h1>
        {sub && <p className="mt-1 max-w-[62ch] text-steel">{sub}</p>}
      </div>
      {action}
    </header>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-rule px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-[46ch] text-steel">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({ tone, children }: { tone: "brass" | "oxblood" | "seal" | "verdigris"; children: ReactNode }) {
  const c = { brass: "bg-brass-tint text-brass", oxblood: "bg-oxblood-tint text-oxblood", seal: "bg-seal-tint text-seal", verdigris: "bg-verdigris-tint text-verdigris" }[tone];
  return <div role="status" className={`rounded-md px-4 py-3 text-[14px] ${c}`}>{children}</div>;
}

export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="drawer" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      {open && (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-rule px-6 py-4">
            <h2 className="text-[17px] font-semibold">{title}</h2>
            <Button onClick={onClose} aria-label="Close">Close</Button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

/** Two-step confirmation without browser dialogs. */
export function ConfirmButton({ label, confirmLabel, onConfirm, tone = "danger" }: { label: string; confirmLabel: string; onConfirm: () => Promise<unknown> | void; tone?: BtnProps["tone"] }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);
  if (!armed) return <Button tone={tone} onClick={() => setArmed(true)}>{label}</Button>;
  return (
    <span className="inline-flex gap-2">
      <Button tone={tone} busy={busy} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); setArmed(false); } }}>{confirmLabel}</Button>
      <Button onClick={() => setArmed(false)}>Cancel</Button>
    </span>
  );
}

export function Toasts() {
  const { toasts, drop } = useToasts();
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={`pointer-events-auto flex items-start justify-between gap-3 rounded-md border px-4 py-3 text-[14px] shadow-sm ${t.tone === "good" ? "border-verdigris/40 bg-verdigris-tint text-verdigris" : t.tone === "bad" ? "border-oxblood/40 bg-oxblood-tint text-oxblood" : "border-rule bg-panel text-ink"}`}>
          <span>
            {t.text}
            {t.hash && <> <ExplorerLink hash={t.hash}>View transaction</ExplorerLink></>}
          </span>
          <button onClick={() => drop(t.id)} className="text-current/70 hover:text-current" aria-label="Dismiss">✕</button>
        </div>
      ))}
    </div>
  );
}

export const ago = (iso: string) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
