"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowUp, Database, Loader2, Sparkles } from "lucide-react";
import { Button, Textarea, cn } from "@platform/ui";

export interface ChatMessage { id: string; role: "user" | "assistant"; content: string; sources?: { name: string; summary: string; ok: boolean }[]; error?: boolean }

/** Minimal, safe Markdown renderer (bold, bullets, numbered lists, paragraphs). No HTML injection possible. */
function Rich({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>);
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))) {
          const ordered = /^\s*\d+\./.test(lines[0] ?? "");
          const Tag = ordered ? "ol" : "ul";
          return <Tag key={i} className={cn("space-y-1 pl-5", ordered ? "list-decimal" : "list-disc")}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""))}</li>)}</Tag>;
        }
        if (/^#{1,4}\s/.test(b)) return <p key={i} className="font-semibold">{inline(b.replace(/^#{1,4}\s/, ""))}</p>;
        return <p key={i} className="whitespace-pre-wrap">{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}</p>;
      })}
    </div>
  );
}

export function Chat({ conversationId: initialId, initialMessages, suggestions, quota: initialQuota, autoAsk, configured, isDemo }: {
  conversationId: string | null; initialMessages: ChatMessage[]; suggestions: string[];
  quota: { limit: number | null; used: number; remaining: number | null }; autoAsk?: string; configured: boolean; isDemo: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [conversationId, setConversationId] = useState(initialId);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [quota, setQuota] = useState(initialQuota);
  const endRef = useRef<HTMLDivElement>(null);
  const asked = useRef(false);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, busy]);

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: "user", content: q }]);
    setBusy(true);
    try {
      const res = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId, message: q }) });
      const data = await res.json().catch(() => ({ error: "Unexpected response" }));
      if (!res.ok) {
        setMessages((m) => [...m, { id: `e-${Date.now()}`, role: "assistant", content: data.error ?? "Something went wrong.", error: true }]);
        return;
      }
      setMessages((m) => [...m, data.message]);
      setQuota(data.quota);
      if (!conversationId) {
        setConversationId(data.conversationId);
        window.history.replaceState(null, "", `/assistant?c=${data.conversationId}`);
        router.refresh();
      }
    } catch {
      setMessages((m) => [...m, { id: `e-${Date.now()}`, role: "assistant", content: "Network problem — check your connection and try again.", error: true }]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (autoAsk && !asked.current && configured) { asked.current = true; void ask(autoAsk); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAsk, configured]);

  const empty = messages.length === 0;
  return (
    <div className="flex h-[calc(100dvh-12rem)] min-h-[420px] flex-col lg:h-[calc(100dvh-9rem)]">
      <div className="flex-1 overflow-y-auto pr-1">
        {empty ? (
          <div className="mx-auto flex max-w-xl flex-col items-center px-2 pt-6 text-center sm:pt-12">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft"><Sparkles className="h-6 w-6 text-primary" /></span>
            <h2 className="mt-4 text-lg font-semibold">Ask anything about your business</h2>
            <p className="mt-1 text-sm text-muted-foreground">Answers come from your own orders, payments, stock and expenses{isDemo ? " (demo data)" : ""}. Every figure is calculated from your records — never guessed.</p>
            {!configured && <p className="mt-4 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">The AI provider isn&apos;t configured on this deployment yet.</p>}
            <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
              {suggestions.map((s) => (
                <button key={s} onClick={() => ask(s)} disabled={!configured} className="rounded-xl border bg-card px-3 py-2.5 text-left text-sm shadow-xs transition hover:border-primary/40 hover:bg-primary-soft/40 disabled:opacity-50">{s}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-5 py-2">
            {messages.map((m) => (
              <div key={m.id} className={cn("flex gap-3", m.role === "user" && "justify-end")}>
                {m.role === "assistant" && <span className={cn("mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", m.error ? "bg-danger-soft" : "bg-primary-soft")}>{m.error ? <AlertCircle className="h-4 w-4 text-danger" /> : <Sparkles className="h-4 w-4 text-primary" />}</span>}
                <div className={cn("max-w-[85%] text-sm leading-relaxed", m.role === "user" ? "rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground" : m.error ? "rounded-2xl bg-danger-soft px-4 py-2.5 text-danger" : "rounded-2xl rounded-tl-md border bg-card px-4 py-3 shadow-xs")}>
                  {m.role === "assistant" && !m.error ? <Rich text={m.content} /> : <p className="whitespace-pre-wrap">{m.content}</p>}
                  {m.sources && m.sources.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-2.5">
                      <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground"><Database className="h-3 w-3" /> Sources:</span>
                      {m.sources.map((s, i) => <span key={i} className={cn("rounded-full px-2 py-0.5 text-2xs", s.ok ? "bg-muted text-muted-foreground" : "bg-danger-soft text-danger")} title={s.name}>{s.summary}</span>)}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex gap-3" role="status">
                <span className="mt-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft"><Loader2 className="h-4 w-4 animate-spin text-primary" /></span>
                <div className="rounded-2xl rounded-tl-md border bg-card px-4 py-3 text-sm text-muted-foreground shadow-xs">Analysing your records…</div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void ask(input); }} className="mx-auto mt-3 w-full max-w-3xl">
        <div className="flex items-end gap-2 rounded-2xl border bg-background p-2 shadow-card focus-within:ring-2 focus-within:ring-ring/30">
          <Textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1} placeholder={configured ? "Ask about sales, profit, customers, stock…" : "AI is not configured"} disabled={!configured}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(input); } }}
            className="max-h-36 min-h-[40px] resize-none border-0 shadow-none focus-visible:ring-0" maxLength={2000} aria-label="Your question" />
          <Button type="submit" size="icon" disabled={!input.trim() || busy || !configured} aria-label="Send"><ArrowUp /></Button>
        </div>
        <p className="mt-1.5 text-center text-2xs text-muted-foreground">
          {quota.limit === null ? "Unlimited AI messages on your plan" : `${quota.remaining} of ${quota.limit} AI messages left this month`}
          {quota.limit !== null && quota.remaining === 0 && <> · <Link href="/settings/billing" className="text-primary">Upgrade</Link></>}
          {" · "}AI can make mistakes — figures shown come straight from your records.
        </p>
      </form>
    </div>
  );
}
